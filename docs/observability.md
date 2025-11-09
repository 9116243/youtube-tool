# Observability

This chapter describes the Prometheus/Grafana surfaces and the signals you can lean on when debugging API/SSE reliability or capacity issues.

## Metrics endpoint

- The backend exposes `/metrics` (see `server/src/routes/metrics.ts`). It responds with `text/plain; version=0.0.4` so Prometheus can scrape it directly.
- `collectDefaultMetrics()` registers Node runtime signals (`process_cpu_seconds_total`, `process_resident_memory_bytes`, GC stats, etc.). Custom counters defined in `server/src/metrics/index.ts` include:
  - `generation_cost_cents_total` (labels: `provider`, `policy`)
  - `gen_provider_requests_total` (labels: `provider`, `action`, `outcome`)
  - `gen_route_decision_total` (labels: `policy`, `from`, `to`)
  - `gen_fallback_total` (labels: `from`, `to`, `reason`)
- Because `register` is exported, you can also add metrics from other modules and they will show up in `/metrics`.

The `alerts/prometheus-rules.yaml` file wires these metrics into Grafana-managed alerts (see next section).

## Grafana dashboard

Import `grafana/dashboards/youtube-observability.json` into your Grafana instance. Key panels:

| Panel | Metric | Purpose |
| --- | --- | --- |
| **API CPU Usage** | `rate(process_cpu_seconds_total{job="youtube-api"}[5m])` | Detect CPU spikes in the API service. |
| **API Memory** | `process_resident_memory_bytes{job="youtube-api"}` | Watch for creeping memory usage that could trigger restarts. |
| **Temporal Availability** | `up{job="temporal"}` | Track the Temporal server lifecycle (should stay at 1). |
| **Pipeline Queue Depth** | `sum(youtube_pipeline_queue_depth)` | Reveal how many segments are waiting to be processed. If this steadily climbs, workers cannot keep up. |
| **Recent Cost Rollup** | `cost_rollup_total_cents` | Visualize actual spend per rollup window (post `COST_ROLLUP_CRON`). |
| **Unit Cost Sigma** | `cost_rollup_unit_cost_sigma` | Watch for sudden price deviations; values above `COST_ALERT_UNIT_COST_SIGMA` (default 2) trigger alerts. |
| **SLA Success Rates** | `analytics_sla_api_success_rate`, `analytics_sla_generation_success_rate` | Track SLAs defined via `SLO_TARGET_API` and `SLO_TARGET_GEN`. |

Use the dashboard description (mirroring the YAML file) as a launchpad when verifying system health after deployments or cost/performance incidents.

## Alerting rules

Rules in `alerts/prometheus-rules.yaml` map state changes to actionable signals:

| Alert | Trigger | Severity | What to do |
| --- | --- | --- | --- |
| `APIDown` | `up{job="youtube-api"} == 0` for 5m | critical | Restart API pods/containers and confirm `npm run build` before redeploying. |
| `TemporalDown` | `up{job="temporal"} == 0` for 3m | critical | Validate Temporal is running and reachable (`grpcurl`, `temporal` CLI). |
| `WorkerDown` | `up{job=~"worker-cpu|worker-gpu"} == 0` for 5m | warning | Check worker pods, inspect logs for crashes or `queue` rejections. |
| `QueueDepthHigh` | `sum(youtube_pipeline_queue_depth) > 100` for 10m | warning | Scale workers, increase `MAX_PAR_SHOTS`, or chase slow render profiles. |
| `UnitCostAnomaly` | `cost_rollup_unit_cost_sigma > 2` for 5m | warning | Tune `PROVIDER_PRICING_FILE` or check whether an external provider misreported minutes. |

These rules are meant to plug into Alertmanager (for on-call paging) or Slack flows.

## Environment knobs

- `COST_ROLLUP_CRON` controls how frequently the `generation` table is aggregated into `generation_costs`. The cron job also emits `cost_rollup_*` metrics powering Grafana panels and the `UnitCostAnomaly` alert.
- `PROVIDER_PRICING_FILE` (defaults to `src/config/providers.cost.json`) defines expected per-minute pricing. The rollup job uses this file to compute `cost_rollup_unit_cost_sigma`.
- `COST_ALERT_UNIT_COST_SIGMA`, `SLO_TARGET_API`, and `SLO_TARGET_GEN` specify thresholds used by the alerts/dashboards generated in the `S12` phase (e.g., the Grafana panel titles above). Tune these in production to balance noise vs. signal.

## Troubleshooting checklist

1. `curl localhost:3001/metrics | head` – make sure the scrape endpoint responds and exposes key counters (queue depth, cost rollups, Node heap). If `curl` fails, check network policies or health probes (`/healthz`).
2. `kubectl apply -f alerts/prometheus-rules.yaml` after any change to alert definitions.
3. `docker exec grafana ...` or the UI import wizard can load `grafana/dashboards/youtube-observability.json`.
4. When SSE or queue delays occur, confirm `sum(youtube_pipeline_queue_depth)` inside Grafana and follow the SSE best-practices in [docs/api-sse.md](./api-sse.md).
5. Run `scripts/selftest.sh` (or `scripts/selftest.ps1`) – the script touches the SSE endpoint, publishes a job, and writes `SELFTEST PASS` so you can validate the entire stack end-to-end.

Link back to [README](../README.md) for onboarding steps; this document focuses on the monitoring/alerting layer.
