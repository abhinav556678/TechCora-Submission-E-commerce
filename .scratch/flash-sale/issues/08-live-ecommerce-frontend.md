# 08 — The Live E-Commerce Frontend (Reactive UI)

**What to build:** A clean, user-facing storefront that reacts to backend events. When the chaos simulation fires 10,000 backend requests, a human user looking at the frontend should see the "Available Stock" instantly drop to 0 and the "Buy" button disable.

**Blocked by:** 05 — Live Observability (Prometheus & Grafana)

**Status:** ready-for-agent

- [ ] Minimal web frontend (HTML/JS or React) displaying product info and an "Available Stock" counter.
- [ ] Frontend establishes a connection to the backend (polling or WebSocket) to fetch live inventory.
- [ ] Frontend allows a manual user to click "Buy" and integrates with the API Gateway.
- [ ] When the k6 simulation runs, the frontend visually updates in real-time as stock depletes.
- [ ] "Buy" button is automatically disabled when stock hits 0.
