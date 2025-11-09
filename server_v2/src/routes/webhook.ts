import { logger } from '../utils/logger.js';
import { loadArtifacts } from '../tasks/artifacts.js';
import { sendWebhookDelivery, signPayload } from '../webhooks/dispatcher.js';

type TaskWebhookPayload = {
  id: string;
  status: string;
  orgId: string;
  timestamp: string;
  artifacts: Record<string, unknown>;
  metrics: Record<string, unknown>;
};

export const buildTaskWebhookPayload = async ({
  taskId,
  orgId,
  status,
  metrics
}: {
  taskId: string;
  orgId: string;
  status: string;
  metrics: Record<string, unknown>;
}): Promise<TaskWebhookPayload> => {
  const artifacts = await loadArtifacts(taskId);
  return {
    id: taskId,
    status,
    orgId,
    timestamp: new Date().toISOString(),
    artifacts: artifacts.artifacts ?? {},
    metrics
  };
};

export { signPayload } from '../webhooks/dispatcher.js';

export const triggerTaskWebhook = async (options: {
  taskId: string;
  orgId: string;
  status: string;
  metrics: Record<string, unknown>;
  webhookUrl: string;
  webhookSecret?: string | null;
}) => {
  const url = options.webhookUrl?.trim();
  if (!url) {
    return;
  }
  try {
    const payload = await buildTaskWebhookPayload({
      taskId: options.taskId,
      orgId: options.orgId,
      status: options.status,
      metrics: options.metrics
    });
    await sendWebhookDelivery({
      taskId: options.taskId,
      organizationId: options.orgId,
      url,
      secret: options.webhookSecret ?? null,
      payload
    });
  } catch (error) {
    logger.warn({ err: error, taskId: options.taskId, webhookUrl: options.webhookUrl }, 'Webhook trigger failed');
  }
};
