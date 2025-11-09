import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { defaultResource, resourceFromAttributes } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { PrismaInstrumentation } from '@prisma/instrumentation';
import pkg from '../../package.json' with { type: 'json' };
import { env } from '../utils/env.js';
import { logger } from './logger.js';

diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ERROR);

let sdk: NodeSDK | null = null;

export const startOtel = async () => {
  if (sdk) {
    return sdk;
  }
  const resource = defaultResource().merge(
    resourceFromAttributes({
      [SemanticResourceAttributes.SERVICE_NAME]: pkg.name ?? 'server_v2',
      [SemanticResourceAttributes.SERVICE_VERSION]: pkg.version ?? '0.0.0'
    })
  );

  sdk = new NodeSDK({
    resource,
    traceExporter: new OTLPTraceExporter({
      url: env.OTEL_EXPORTER_OTLP_ENDPOINT
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-http': {
          enabled: true
        },
        '@opentelemetry/instrumentation-express': {
          enabled: true
        }
      }),
      new PrismaInstrumentation()
    ]
  });

  await sdk.start();
  logger.info('OpenTelemetry initialized');
  return sdk;
};

export const shutdownOtel = async () => {
  if (!sdk) return;
  try {
    await sdk.shutdown();
    logger.info('OpenTelemetry shutdown complete');
  } catch (error) {
    logger.warn({ err: error }, 'Failed to shutdown OpenTelemetry');
  } finally {
    sdk = null;
  }
};
