import { Counter, Gauge, Summary, Registry, collectDefaultMetrics } from 'prom-client';

export const register = new Registry();

collectDefaultMetrics({ register });

export const metrics = {
  tasksCreated: new Counter({
    name: 'tasks_created_total',
    help: 'Total tasks created',
    registers: [register]
  }),
  tasksFinished: new Counter({
    name: 'tasks_finished_total',
    help: 'Total tasks finished successfully',
    registers: [register]
  }),
  tasksFailed: new Counter({
    name: 'tasks_failed_total',
    help: 'Total tasks that failed',
    registers: [register]
  }),
  tasksCancelled: new Counter({
    name: 'tasks_cancelled_total',
    help: 'Total tasks cancelled',
    registers: [register]
  }),
  renderVmaf: new Summary({
    name: 'render_vmaf_score',
    help: 'Distribution of VMAF scores emitted by the burn pipeline',
    ageBuckets: 5,
    maxAgeSeconds: 600,
    registers: [register]
  }),
  renderLoudness: new Summary({
    name: 'render_loudness_lufs',
    help: 'Integrated loudness (LUFS) reported by the burn pipeline',
    ageBuckets: 5,
    maxAgeSeconds: 600,
    registers: [register]
  }),
  renderRetries: new Counter({
    name: 'render_retry_total',
    help: 'Number of burn re-renders triggered due to low quality',
    registers: [register]
  }),
  queueEnqueued: new Counter({
    name: 'queue_enqueued_total',
    help: 'Tasks enqueued into the worker queue',
    labelNames: ['driver'],
    registers: [register]
  }),
  queueFailed: new Counter({
    name: 'queue_failed_total',
    help: 'Jobs that exhausted retries or failed permanently',
    registers: [register]
  }),
  queueRetry: new Counter({
    name: 'queue_retry_total',
    help: 'Jobs that were retried automatically',
    registers: [register]
  }),
  queueDeadletter: new Counter({
    name: 'queue_deadletter_total',
    help: 'Jobs moved into the dead-letter queue',
    registers: [register]
  }),
  queueQueued: new Gauge({
    name: 'queue_queued',
    help: 'Number of queued tasks',
    registers: [register]
  }),
  queueRunning: new Gauge({
    name: 'queue_running',
    help: 'Number of running tasks',
    registers: [register]
  }),
  taskDuration: new Summary({
    name: 'task_duration_seconds',
    help: 'Task execution duration in seconds',
    ageBuckets: 5,
    maxAgeSeconds: 300,
    registers: [register]
  }),
  uploadsAccepted: new Counter({
    name: 'uploads_accepted_total',
    help: 'Number of uploads accepted into storage',
    registers: [register]
  }),
  uploadsRejected: new Counter({
    name: 'uploads_rejected_total',
    help: 'Number of uploads rejected due to validation or policy',
    registers: [register]
  }),
  uploadsQuarantined: new Counter({
    name: 'uploads_quarantined_total',
    help: 'Number of uploads quarantined by malware scanning',
    registers: [register]
  }),
  generationCost: new Counter({
    name: 'generation_cost_cents_total',
    help: 'Total cents reported by generation providers',
    labelNames: ['provider', 'policy'],
    registers: [register]
  }),
  generationProviderRequests: new Counter({
    name: 'gen_provider_requests_total',
    help: 'External generation provider calls grouped by provider/action/outcome',
    labelNames: ['provider', 'action', 'outcome'],
    registers: [register]
  }),
  generationRouteDecision: new Counter({
    name: 'gen_route_decision_total',
    help: 'Routing decisions grouped by policy and provider transitions',
    labelNames: ['policy', 'from', 'to'],
    registers: [register]
  }),
  generationFallback: new Counter({
    name: 'gen_fallback_total',
    help: 'Generation fallbacks between providers',
    labelNames: ['from', 'to', 'reason'],
    registers: [register]
  }),
  generationLicenseBlock: new Counter({
    name: 'gen_license_block_total',
    help: 'Publish attempts blocked due to license restrictions',
    labelNames: ['provider', 'reason'],
    registers: [register]
  }),
  deadletterReplayed: new Counter({
    name: 'deadletter_replayed_total',
    help: 'Dead letter tasks replayed back into the queue',
    registers: [register]
  }),
  deadletterPurged: new Counter({
    name: 'deadletter_purged_total',
    help: 'Dead letter tasks purged by admins',
    registers: [register]
  }),
  usageTasks: new Counter({
    name: 'usage_tasks_total',
    help: 'Tasks counted toward per-org quota',
    labelNames: ['orgId'],
    registers: [register]
  }),
  usageMinutes: new Counter({
    name: 'usage_minutes_total',
    help: 'Render minutes counted toward per-org quota',
    labelNames: ['orgId'],
    registers: [register]
  }),
  usageStorage: new Gauge({
    name: 'usage_storage_bytes',
    help: 'Current storage usage per org in bytes',
    labelNames: ['orgId'],
    registers: [register]
  }),
  storageUploadBytes: new Counter({
    name: 'storage_upload_bytes_total',
    help: 'Bytes uploaded via managed endpoints',
    labelNames: ['orgId'],
    registers: [register]
  }),
  storageDownloadBytes: new Counter({
    name: 'storage_download_bytes_total',
    help: 'Bytes downloaded via managed endpoints',
    labelNames: ['orgId'],
    registers: [register]
  }),
  webhookDeliveries: new Counter({
    name: 'webhook_delivery_total',
    help: 'Webhook delivery results grouped by status',
    labelNames: ['status'],
    registers: [register]
  }),
  webhookDuration: new Summary({
    name: 'webhook_delivery_duration_ms',
    help: 'Webhook delivery duration in milliseconds',
    ageBuckets: 5,
    maxAgeSeconds: 600,
    percentiles: [0.5, 0.9, 0.95, 0.99],
    registers: [register]
  }),
  webhookInflight: new Gauge({
    name: 'webhook_delivery_inflight',
    help: 'Number of webhook deliveries currently in-flight',
    registers: [register]
  })
};

export const updateQueueMetrics = (counts: { queued: number; running: number }) => {
  metrics.queueQueued.set(counts.queued);
  metrics.queueRunning.set(counts.running);
};
