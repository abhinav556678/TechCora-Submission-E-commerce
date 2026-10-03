# 05 — Live Observability (Prometheus & Grafana)

**What to build:** A visual dashboard that acts as the "proof" for the simulation. When users generate traffic, the dashboard immediately reacts, showing traffic spikes, inventory dropping, and the queue absorbing the load.

**Blocked by:** 04 — Chaos Simulation Framework (k6 & Orchestrator CLI)

**Status:** ready-for-agent

- [ ] Prometheus and Grafana are running via Docker Compose.
- [ ] API Gateway and DB Worker expose a `/metrics` endpoint.
- [ ] Grafana dashboard displays real-time Requests Per Second (RPS).
- [ ] Grafana dashboard displays live inventory levels per warehouse.
- [ ] Grafana dashboard displays the current RabbitMQ queue size.
