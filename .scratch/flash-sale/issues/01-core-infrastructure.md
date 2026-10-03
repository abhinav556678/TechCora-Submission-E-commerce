# 01 — Core Infrastructure & The "Sold Out" Baseline

**What to build:** The foundational infrastructure and a working API that can correctly identify when inventory is depleted. Users should be able to hit a `POST /buy` endpoint and receive a success response if stock exists, or a sold-out error if stock is 0.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] `docker-compose.yml` runs Redis and PostgreSQL locally.
- [ ] API server (Node/Go) runs and connects to Redis.
- [ ] `POST /buy` checks a simple Redis counter.
- [ ] Returns `202 Accepted` if successful.
- [ ] Returns `400 Sold Out` when the counter reaches 0.
