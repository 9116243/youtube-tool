import pino from 'pino';
import { context as otelContext, trace } from '@opentelemetry/api';
import { env } from '../utils/env.js';
import { getRequestContext } from './context.js';

const SERVICE_NAME = 'youtube-tool-server-v2';

const buildBindings = () => {
  const bindings: Record<string, unknown> = {};
  const requestContext = getRequestContext();
  if (requestContext?.requestId) {
    bindings.requestId = requestContext.requestId;
  }
  if (requestContext?.orgId) {
    bindings.orgId = requestContext.orgId;
  }
  if (requestContext?.userId) {
    bindings.userId = requestContext.userId;
  }
  const span = trace.getSpan(otelContext.active());
  const spanContext = span?.spanContext();
  if (spanContext?.traceId) {
    bindings.traceId = spanContext.traceId;
  }
  if (spanContext?.spanId) {
    bindings.spanId = spanContext.spanId;
  }
  return bindings;
};

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: SERVICE_NAME },
  hooks: {
    logMethod(args, method) {
      const bindings = buildBindings();
      if (Object.keys(bindings).length > 0) {
        if (typeof args[0] === 'object' && args[0] !== null) {
          args[0] = { ...bindings, ...args[0] };
        } else {
          args.unshift(bindings);
        }
      }
      return method.apply(this, args as Parameters<typeof method>);
    }
  }
});
