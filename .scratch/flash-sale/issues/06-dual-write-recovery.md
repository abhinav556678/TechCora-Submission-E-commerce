# 06 — Edge Case: Dual-Write Crash Recovery & Reaper

**What to build:** A safety net for partial failures. If the API reserves stock but catastrophically crashes before queuing the order, the system must detect this orphaned reservation and put the item back on the shelf after 5 minutes.

**Blocked by:** 04 — Chaos Simulation Framework (k6 & Orchestrator CLI)

**Status:** ready-for-agent

- [ ] Redis reservations include a 5-minute TTL.
- [ ] Background Reaper worker (or Keyspace Notifications) detects expired reservations.
- [ ] Reaper correctly increments the inventory back to the correct warehouse in Redis.
- [ ] Added `POST /api/buy/simulate-crash` endpoint that deducts stock but skips the queue.
- [ ] Executing the crash endpoint in the demo menu results in the stock returning after the TTL.
