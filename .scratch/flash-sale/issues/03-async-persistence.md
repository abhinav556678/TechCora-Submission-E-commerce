# 03 — Asynchronous Persistence (RabbitMQ & Postgres Worker)

**What to build:** Safe, durable storage for successful reservations without slowing down the API. After a user secures stock, their order is securely trickled into a database without causing locks or crashes.

**Blocked by:** 02 — The Atomic Gatekeeper (Multi-Warehouse Lua Script)

**Status:** ready-for-agent

- [ ] RabbitMQ is added to `docker-compose.yml`.
- [ ] API publishes an `OrderReserved` message to RabbitMQ upon a successful Redis reservation.
- [ ] Background worker service listens to RabbitMQ and consumes messages.
- [ ] Worker successfully writes the order to the `orders` table in Postgres using manual `ACK`.
