/**
 * OpenTelemetry tracing bootstrap.
 * Must be imported BEFORE any other module so auto-instrumentations can patch.
 */
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

let sdk: NodeSDK | undefined;

export function initTracing(): void {
  if (sdk) return;
  if (process.env.NODE_ENV === 'test') return;

  sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME || 'brsr-api',
    traceExporter: new OTLPTraceExporter({
      url: `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318'}/v1/traces`,
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  try {
    sdk.start();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[otel] failed to start tracing', err);
  }

  process.on('SIGTERM', () => {
    void sdk?.shutdown();
  });
}
