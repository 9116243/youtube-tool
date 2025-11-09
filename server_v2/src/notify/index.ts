import nodemailer from 'nodemailer';
import fetch from 'node-fetch';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { env } from '../utils/env.js';
import { logger } from '../utils/logger.js';
import { buildNotificationTemplate, type NotificationEvent, type NotificationContextMap } from './templates.js';

type ChannelType = 'email' | 'slack' | 'feishu';

const notificationConfigSchema = z.object({
  channels: z
    .object({
      email: z
        .object({
          recipients: z.array(z.string().email()).min(1)
        })
        .optional(),
      slack: z.object({ webhookUrl: z.string().url() }).optional(),
      feishu: z.object({ webhookUrl: z.string().url() }).optional()
    })
    .partial()
    .default({}),
  events: z
    .record(z.enum(['task.failed', 'task.completed', 'alert.threshold']), z.array(z.enum(['email', 'slack', 'feishu'])).min(1))
    .optional()
});

type OrgNotificationConfig = z.infer<typeof notificationConfigSchema>;

const cache = new Map<string, { expiresAt: number; config: OrgNotificationConfig }>();
const CACHE_TTL_MS = 60_000;

const emailTransport =
  env.SMTP_HOST && env.SMTP_USER
    ? nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_PORT === 465,
        auth: env.SMTP_PASS ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined
      })
    : null;

const defaultChannels = (): OrgNotificationConfig['channels'] => {
  const channels: OrgNotificationConfig['channels'] = {};
  if (emailTransport && env.SMTP_USER) {
    channels.email = { recipients: [env.SMTP_USER] };
  }
  if (env.SLACK_WEBHOOK_URL) {
    channels.slack = { webhookUrl: env.SLACK_WEBHOOK_URL };
  }
  if (env.FEISHU_WEBHOOK_URL) {
    channels.feishu = { webhookUrl: env.FEISHU_WEBHOOK_URL };
  }
  return channels;
};

const defaultEvents = (channels: OrgNotificationConfig['channels']) => {
  const available = (channel: ChannelType) => {
    if (channel === 'email') return Boolean(channels.email);
    if (channel === 'slack') return Boolean(channels.slack);
    if (channel === 'feishu') return Boolean(channels.feishu);
    return false;
  };
  const pick = (...items: ChannelType[]) => items.filter(available);
  return {
    'task.failed': pick('email', 'slack', 'feishu'),
    'task.completed': pick('slack', 'feishu'),
    'alert.threshold': pick('email', 'slack', 'feishu')
  } satisfies OrgNotificationConfig['events'];
};

const mergeConfig = (base: OrgNotificationConfig, override?: OrgNotificationConfig) => {
  if (!override) return base;
  return {
    channels: { ...base.channels, ...override.channels },
    events: { ...base.events, ...override.events }
  };
};

const loadConfig = async (orgId: string): Promise<OrgNotificationConfig> => {
  const cached = cache.get(orgId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.config;
  }
  const record = await prisma.notificationRule.findUnique({
    where: { organizationId: orgId }
  });
  const baseChannels = defaultChannels();
  const base: OrgNotificationConfig = {
    channels: baseChannels,
    events: defaultEvents(baseChannels)
  };
  let override: OrgNotificationConfig | undefined;
  if (record) {
    try {
      override = notificationConfigSchema.parse(JSON.parse(record.config));
    } catch (error) {
      logger.warn({ err: error, orgId }, 'Invalid notification config JSON');
    }
  }
  const config = mergeConfig(base, override);
  cache.set(orgId, { config, expiresAt: Date.now() + CACHE_TTL_MS });
  return config;
};

const sendEmail = async (recipients: string[], subject: string, text: string) => {
  if (!emailTransport) return;
  await emailTransport.sendMail({
    from: env.SMTP_USER,
    to: recipients.join(','),
    subject,
    text
  });
};

const postJson = async (url: string, body: unknown) => {
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
};

const sendSlack = (webhookUrl: string, text: string) => postJson(webhookUrl, { text });
const sendFeishu = (webhookUrl: string, payload: { msg_type: string; content: unknown }) => postJson(webhookUrl, payload);

export const sendOrgNotification = async <T extends NotificationEvent>(
  event: T,
  context: NotificationContextMap[T]
) => {
  const config = await loadConfig(context.orgId);
  const targets = config.events?.[event];
  if (!targets || targets.length === 0) {
    return;
  }
  const template = buildNotificationTemplate(event, context);
  await Promise.all(
    targets.map(async (target) => {
      try {
        if (target === 'email' && config.channels.email) {
          await sendEmail(config.channels.email.recipients, template.subject, template.text);
        } else if (target === 'slack' && config.channels.slack) {
          await sendSlack(config.channels.slack.webhookUrl, template.slack.text);
        } else if (target === 'feishu' && config.channels.feishu) {
          await sendFeishu(config.channels.feishu.webhookUrl, template.feishu);
        }
      } catch (error) {
        logger.warn({ err: error, orgId: context.orgId, channel: target }, 'Notification delivery failed');
      }
    })
  );
};

export const notifyTaskStatus = async (context: NotificationContextMap['task.failed']) => {
  const event = context.status === 'failed' ? 'task.failed' : 'task.completed';
  await sendOrgNotification(event, context as NotificationContextMap[typeof event]);
};

export const notifyThresholdAlert = async (context: NotificationContextMap['alert.threshold']) => {
  await sendOrgNotification('alert.threshold', context);
};
