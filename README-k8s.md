# K8s 部署

此目录下的 Helm charts、ArgoCD 应用与监控清单构成了整套 Kubernetes 投产级模板。按下文变量完成镜像构建后，通过 ArgoCD sync 即可把 API/worker/Temporal/Redis/Postgres/MinIO 一次性拉起。

## 1. 组件概览

- `deploy/charts/api`：从 HTTPS API→SSE→Temporal client 的核心服务，包含 ConfigMap / Secret / ingress。
- `deploy/charts/worker-cpu` & `deploy/charts/worker-gpu`：分别部署 Temporal CPU/GPU worker，GPU 默认带 `nvidia.com/gpu` `nodeSelector` 和容忍。
- `deploy/charts/temporal`：简化版 `temporalio/auto-setup`，指向 Helm 中的 Postgres/Redis/MinIO。可在 values 文件中替换为生产级 helm chart。
- `deploy/charts/{redis,postgres,minio}`：自管理的关系型缓存/对象存储底座；附带 PVC/Service/Probe。
- `deploy/argocd/app-of-apps.yaml`：指向 `deploy/argocd/apps/*.yaml`，这些子 Application 指向上面的 Helm charts。
- `deploy/argocd/overlays/{common,dev,staging,prod}`：以 `common` 作为基础，分别打包所有的子 Application，便于在不同命名空间切换。
- `grafana/dashboards` & `alerts/prometheus-rules.yaml`：提供基础观测与告警，建议用 Grafana & Prometheus Operator 直接引入。

## 2. 关键环境变量

| Key | 提示 | 说明 |
| --- | --- | --- |
| `K8S_ENABLED` | `true` | 控制 API 显式激活 `K8S` 路由/资源限制。 |
| `PUBLIC_BASE_URL` | `https://api.example.com` | 对应 `api.ingress.host`，也是前端 SSE/CORS 目的地。 |
| `REGISTRY_URL` | `ghcr.io/example` | 镜像地址前缀（`ghcr.io/example/api`、`.../worker-cpu` 等）。 |
| `IMAGE_TAG` | `latest` | CI 构建后用于标记镜像。配合 `.github/workflows/cicd.yml` 推送。 |
| `POSTGRES_*` | `postgres`/`5432`/`youtube_tool`/`changeme` | Helm chart 会将这些值注入 Postgres、Temporal 及 API。 |
| `REDIS_URL` | `redis://redis:6379` | 给 API/worker/Temporal 使用。 |
| `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY` | `http://minio:9000` / `minio` / `minio123` | MinIO 统一凭证。 |
| `TEMPORAL_*` | `temporal:7233`、task queue、SSE secret 等 | API 与 worker 通过 env 直连 Temporal。 |

## 3. 部署步骤

1. **构建镜像**
   ```bash
   REGISTRY_URL=ghcr.io/acme IMAGE_TAG=$(git rev-parse --short HEAD) DOCKER_PUSH=true \
   REGISTRY_USERNAME=${REGISTRY_USERNAME} REGISTRY_PASSWORD=${REGISTRY_PASSWORD} \
   npm run build # (内部已编译 worker.cpu/gpu)
   npm run build:images # 参考 .github/workflows/cicd.yml
   ```
2. **同步 ArgoCD**
   - 把 `deploy/argocd/app-of-apps.yaml` 推到 ArgoCD，确保 App of Apps 指向 `deploy/argocd/apps`。
   - 选择 `deploy/argocd/overlays/<env>`（例如 `dev`）挂载给 Argo，应自动 `CreateNamespace` 并拉起所有子应用。
3. **验证**
   - `kubectl get pods -n default`/`workers`/`temporal` etc 确认 `Status=Running`。
   - `curl https://<PUBLIC_BASE_URL>/healthz`/`/v1/selftest`（见 `scripts/selftest.*`）获得 `SELFTEST PASS`。

## 4. 观测与告警

- Grafana Dashboard: 直接导入 `grafana/dashboards/youtube-observability.json`，变量为 `Prometheus` 数据源即可读取 `up`、`process_cpu_seconds_total` 等指标。
- Prometheus 规则: 通过 `alerts/prometheus-rules.yaml` 创建 `PrometheusRule`，其中包含 API/Temporal/Worker down 及队列积压告警。

## 5. ArgoCD 多环境

- `deploy/argocd/overlays/common/kustomization.yaml` 包含所有子 Application。
- `dev`/`staging`/`prod` overlay 引用 `../common`，可再增加 `configMapGenerator` 或 `patchesStrategicMerge` 做差异化配置。
- 可以通过 `kubectl apply -k deploy/argocd/overlays/dev` 手动应用，或由 ArgoCD 直接管理。

## 6. 后续建议

- 增加 `Helm` `values-production.yaml` 覆盖 secrets、资源。可以在 ArgoCD 的 `valueFiles` 中追加。
- 若希望 `Temporal` 直接使用官方 Helm chart，可把 `deploy/argocd/apps/temporal.yaml` 指向 `charts/temporal` 的子 chart。
