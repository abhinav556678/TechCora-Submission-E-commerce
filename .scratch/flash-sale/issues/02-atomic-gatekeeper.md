# 02 — The Atomic Gatekeeper (Multi-Warehouse Lua Script)

**What to build:** An ultra-fast, race-condition-proof reservation system. A user clicking "Buy" simultaneously with 10,000 others should never result in overselling, and a single user attempting to buy multiple times simultaneously should only secure one unit. 

**Blocked by:** 01 — Core Infrastructure & The "Sold Out" Baseline

**Status:** ready-for-agent

- [ ] API executes a Redis Lua script for the `POST /buy` operation.
- [ ] Lua script correctly deducts from multiple warehouse keys (e.g., WH_A, WH_B).
- [ ] Lua script checks a user idempotency set to prevent the same user from reserving twice.
- [ ] Concurrent load testing (using basic tools) confirms absolutely zero overselling below 0.
