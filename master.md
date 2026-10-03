# Master Project Plan: Distributed Flash Sale System

## 1. Project Overview & The Core Problem
**Objective:** Design and demonstrate a distributed system capable of handling extreme concurrency (10,000+ users) attempting to purchase limited inventory (100 items) in a flash sale, guaranteeing absolutely zero overselling.

**The Problem: The "Thundering Herd"**
If 10,000 users hit a standard database (User clicks "Buy" -> API checks DB -> API updates DB) at the exact same second, the system fails in two ways:
1.  **Race Conditions (Overselling):** 500 requests check the database at the same millisecond, all see `inventory = 10`, bypass the check, and oversell the stock.
2.  **Lock Contention (Crashing):** To prevent race conditions, databases use row-level locking. 10,000 requests fighting for the same row causes CPU spikes, timeouts, and cascading system failure.

**The Solution Strategy:**
Decouple the fast "reservation" from the slow "database write." Use an ultra-fast, in-memory bouncer (Redis) to do the math and hand out the 100 tickets. The lucky 100 are put into a waiting line (Message Queue) where a worker safely writes them into the permanent ledger (PostgreSQL).

---

## 2. System Architecture & Tech Stack
*   **API Gateway / Backend:** Node.js (Express/Fastify) or Go (Fiber/Gin) for high async I/O throughput.
*   **Atomic Gatekeeper (Multi-Warehouse):** Redis (running a Lua script for atomic inventory decrement across multiple warehouse pools).
*   **Message Broker:** RabbitMQ or Kafka (the shock absorber to buffer successful reservations).
*   **Database:** PostgreSQL (for final, durable order storage).
*   **Simulation / Load Testing:** k6 (open-source load testing tool).
*   **Observability:** Prometheus & Grafana (for live dashboarding).
*   **Infrastructure:** Docker & Docker Compose.

---

## 3. The Request Lifecycle (End-to-End Flow)
1.  **The Onslaught:** 10,000 HTTP `POST /api/buy` requests hit the API Gateway simultaneously.
2.  **The Bouncer:** API Gateway executes a Redis Lua script. The script locks the thread for a microsecond to check idempotency and warehouse stock, and deducts 1 if available, adding a 5-minute TTL hold.
3.  **Immediate Rejection:** 9,900 users instantly receive an HTTP `400 Sold Out` directly from Redis. The database is entirely untouched.
4.  **The Queue:** For the 100 winners, the API Gateway pushes an `OrderReserved` message to RabbitMQ/Kafka.
5.  **Immediate Success:** The 100 winners instantly receive an HTTP `202 Accepted` ("Processing...").
6.  **Async DB Write:** A background worker slowly pulls from the queue and executes `INSERT INTO orders` in Postgres safely.
7.  **Confirmation:** User pays via Stripe; webhook confirms the order idempotently.

---

## 4. The State Machine
1.  **AVAILABLE:** Inventory pool in Redis distributed across warehouses (e.g., `inventory:WH_A = 60`, `inventory:WH_B = 40`).
2.  **RESERVED:** Redis atomically decrements inventory. User gets a 5-minute TTL hold. Event pushed to queue.
3.  **PAYMENT_PENDING:** Database consumer writes the order to Postgres.
4.  **CONFIRMED:** Payment successful webhook received. Handled idempotently.
5.  **EXPIRED/CANCELLED:** TTL ends or payment fails. Compensation worker returns +1 to the warehouse in Redis.

---

## 5. Implementation Phases
### Phase 1: Core Services Setup
1.  **Initialize Database:** Create an `orders` table with idempotency constraints (`user_id`, `product_id`) and a `transaction_id`.
2.  **Develop API Gateway:** Endpoint `POST /api/buy` extracts `user_id` and executes Lua script.
3.  **Implement Redis Lua Script (Multi-Warehouse Aware):** Check user idempotency, check warehouse availability, decrement, set TTL, return status.
4.  **Message Queue & DB Worker:** Publish `OrderReserved` to RabbitMQ. Background worker consumes and `INSERT`s to Postgres.

### Phase 2: Simulation Pipeline (k6)
*   Create load test scripts to ramp up from 0 to 10,000 users in 5 seconds.

### Phase 3: Observability & Dashboarding
*   Build a Grafana dashboard with panels for **Traffic (RPS)**, **Inventory Level (per warehouse)**, **API Latency**, and **Queue Size**.

---

## 6. The Demo & Chaos Simulation Script
To visually prove the architecture works, we use a CLI menu (`demo_menu.sh`) to inject chaos during the presentation. 
*Pro-Tip:* We intentionally add a `sleep(500ms)` delay to the DB Worker so the queue drains slowly over 50 seconds. This visually separates the "fast" API from the "slow" database on Grafana.

**Simulation Scenarios:**
1.  **The Perfect Run:** Launch 10,000 normal users. 
    *   *Visual:* Grafana shows traffic spike, inventory flatlines perfectly at zero, API latency remains under 20ms, and queue fills up then slowly drains to DB.
2.  **Duplicate Client Requests (The Impatient User):** 10,000 users spamming the "Buy" button (using identical User IDs). 
    *   *Visual:* Grafana shows massive traffic, but DB only records 1 order per unique user due to Redis Lua idempotency.
3.  **Database Worker Crash (Message Durability):** 
    *   *Action:* Run k6, wait 3 seconds, then `docker stop worker_service`. 
    *   *Visual:* Queue backs up, DB stops updating, but API keeps serving users. Restart worker -> queue safely drains. No data lost.
4.  **API Crash After Reservation (The Dual-Write Failure):** 
    *   *Action:* Hit a mock API endpoint (`/simulate-crash`) that deducts Redis inventory but intentionally fails before publishing to RabbitMQ.
    *   *Visual:* Inventory drops by 1, but queue is empty. Wait for the 10-second (demo shortened) TTL to expire. Inventory automatically jumps back up by 1 via the background reaper.

---

## 7. Edge Cases & Resilience Details
*   **The Dual-Write Problem (Crash After Reservation):** Handled by Redis TTLs. A background reconciliation worker (using Redis Keyspace Notifications) detects expired keys not in the DB and automatically increments the warehouse inventory back.
*   **Database Worker Crash:** RabbitMQ requires manual message acknowledgment (`ACK`). If a worker crashes mid-process, the message is returned to the queue for another worker.
*   **Duplicate Payment Webhooks:** The webhook handler uses a strict idempotency key (`transaction_id`). If Stripe sends a success event twice, the DB unique constraint or pre-flight state check prevents double-processing.
*   **Uneven Multi-Warehouse Depletion:** Handled inside the atomic Lua script. If WH_A is out of stock, the script automatically checks WH_B within the exact same locked microsecond.
*   **The Abandoned Cart (No Payment):** If payment is not received within the TTL, a cron job cancels the pending DB record and publishes a restock event to increment Redis.

---

## 8. Trade-offs & Limitations
No architecture is perfect. To achieve extreme concurrency and zero overselling, we made specific trade-offs:
*   **Eventual Consistency vs. Strong Consistency:** We optimized for extreme availability and low latency at the gateway. The sacrifice is that the Postgres database is momentarily out-of-sync with Redis while the queue drains. Users see a "processing" state before full confirmation.
*   **System Complexity:** We introduced three separate infrastructure components (Redis, Message Broker, Background Workers) to protect one RDBMS. This increases operational overhead, debugging difficulty, and requires robust distributed tracing/monitoring.
*   **Data Volatility Risk:** Since Redis acts as the source of truth for inventory during the flash sale, if the Redis node crashes catastrophically before the queue receives the message (and without strict AOF persistence), we risk losing active reservation data.