export type NotificationEvent = 'task.failed' | 'task.completed' | 'alert.threshold';

export type TaskNotificationContext = {
  orgId: string;
  taskId: string;
  title?: string | null;
  status: 'failed' | 'success';
  preset?: string | null;
  reason?: string;
};

export type ThresholdNotificationContext = {
  orgId: string;
  kind: 'failrate' | 'queue';
  value: number;
  threshold: number;
  windowMinutes?: number;
};

export type NotificationContextMap = {
  'task.failed': TaskNotificationContext;
  'task.completed': TaskNotificationContext;
  'alert.threshold': ThresholdNotificationContext;
};

export type ChannelPayload = {
  subject: string;
  text: string;
  slack: { text: string };
  feishu: { msg_type: 'text'; content: { text: string } };
};

const formatPercent = (num: number) => `${(num * 100).toFixed(2)}%`;

export const buildNotificationTemplate = <T extends NotificationEvent>(
  event: T,
  context: NotificationContextMap[T]
): ChannelPayload => {
  if (event === 'alert.threshold') {
    const data = context as ThresholdNotificationContext;
    const label = data.kind === 'failrate' ? 'Failure rate' : 'Queue depth';
    const details =
      data.kind === 'failrate'
        ? `${formatPercent(data.value)} (window ${data.windowMinutes ?? 5}m)`
        : `${Math.round(data.value)} tasks`;
    const subject = `[${data.orgId}] ${label} alert`;
    const body = `${label} crossed threshold ${data.kind === 'failrate' ? formatPercent(data.threshold) : data.threshold
      } (observed ${details}).`;
    return {
      subject,
      text: body,
      slack: { text: body },
      feishu: { msg_type: 'text', content: { text: body } }
    };
  }

  const data = context as TaskNotificationContext;
  const subject = `[${data.orgId}] Task ${data.status === 'failed' ? 'failed' : 'completed'}: ${data.title ?? data.taskId}`;
  const reasonLine = data.reason ? `\nReason: ${data.reason}` : '';
  const body = `Task ${data.taskId} (${data.title ?? 'untitled'}) ${data.status === 'failed' ? 'failed' : 'completed'}${reasonLine}`;
  return {
    subject,
    text: body,
    slack: { text: body },
    feishu: { msg_type: 'text', content: { text: body } }
  };
};
