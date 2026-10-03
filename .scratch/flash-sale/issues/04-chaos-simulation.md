# 04 — Chaos Simulation Framework (k6 & Orchestrator CLI)

**What to build:** A demonstrator toolkit that allows a presenter to reliably simulate extreme traffic spikes and inject failures against the running system.

**Blocked by:** 03 — Asynchronous Persistence (RabbitMQ & Postgres Worker)

**Status:** ready-for-agent

- [ ] `demo_menu.sh` bash script is fully interactive with options for normal run, duplicate requests, and worker crashes.
- [ ] k6 `normal_run.js` load script correctly simulates 10,000 users hitting the API.
- [ ] k6 `duplicate_requests.js` simulates frantic users (many requests using the same small pool of user IDs).
- [ ] Scripts successfully generate traffic against the local API and queue.
