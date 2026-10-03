# 07 — Edge Case: Payment Webhook & Idempotency

**What to build:** A robust payment confirmation handler. If a payment provider (like Stripe) sends a success notification multiple times due to a network glitch, the database only processes the confirmation once.

**Blocked by:** 03 — Asynchronous Persistence (RabbitMQ & Postgres Worker)

**Status:** ready-for-agent

- [ ] `POST /webhook/payment` endpoint receives mock Stripe payloads.
- [ ] Postgres schema enforces `UNIQUE(transaction_id)` to prevent double inserts.
- [ ] Webhook logic checks if the order is already `CONFIRMED` and returns `200 OK` safely.
- [ ] Sending identical webhook payloads does not cause system errors or data duplication.
