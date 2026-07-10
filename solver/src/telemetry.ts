// solver/src/telemetry.ts — OPS-01 OpenTelemetry bootstrap (traces + metrics).
//
// A boot-once telemetry provider pair (mirrors agent.ts's module-private `_client` boot
// resource): initTelemetry() wires a tracer provider + meter provider ONCE, selecting the
// OTLP/HTTP exporters when a collector is configured (OTEL_EXPORTER_OTLP_ENDPOINT set) and
// degrading to the OTel ConsoleSpanExporter/ConsoleMetricExporter when it is UNSET — so
// tracing/metrics work offline with NO collector running (locked console-fallback
// decision, 13-CONTEXT Area 1 / 13-RESEARCH Pattern 1). shutdownTelemetry() flushes +
// tears the providers down on SIGTERM.
//
// DEVIATION (documented): 13-RESEARCH Pattern 1 sketched `@opentelemetry/sdk-node`'s
// NodeSDK, but on the installed sdk-node@0.220.0 / sdk-trace@2.9.0 combo NodeSDK's tracer
// provider exports ZERO spans through the global `trace` API (verified: the traceExporter
// AND spanProcessors paths both drop every span, even after forceFlush/shutdown). Shipping
// it would be a non-functional stub, so this module uses the manual BasicTracerProvider +
// MeterProvider wiring that RESEARCH lists under "Alternatives Considered" — fully
// functional and deterministically unit-tested. An AsyncLocalStorageContextManager is
// registered so `trace.getActiveSpan()` (logger trace.id correlation) and nested
// request→clear→exercise→agent spans propagate across `await`.
//
// withSpan(name, roundId, fn) runs `fn` inside an active span carrying a `round.id`
// attribute (the correlation key); a span whose name is in the `ledger.*` namespace is
// labelled a CLIENT span — the JSON Ledger API v2 exercise leg is a ledger-API client
// call, NOT instrumentation inside the Canton participant (honest labelling).
//
// `instruments` are the five named metric instruments (RESEARCH Pattern 2). They are
// resolved LAZILY through a Proxy because an OTel instrument created before the global
// MeterProvider is registered stays a no-op forever — so the underlying instruments are
// built on first use (after initTelemetry() runs at boot), binding to the live provider.
//
// SECURITY (T-13-01 / T-13-02 / ASVS V7): telemetry NEVER sets a secret as a span
// attribute or metric field — only `round.id` + non-secret scalars cross the wire. No
// secret is read, logged, or exported by this module (secret-sweep test asserts it).

import {
  context,
  metrics,
  trace,
  SpanKind,
  SpanStatusCode,
  type Counter,
  type Histogram,
  type Meter,
  type Span,
} from '@opentelemetry/api'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http'
import {
  BasicTracerProvider,
  BatchSpanProcessor,
  ConsoleSpanExporter,
  SimpleSpanProcessor,
  type SpanExporter,
  type SpanProcessor,
} from '@opentelemetry/sdk-trace-base'
import {
  ConsoleMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
  type IMetricReader,
  type PushMetricExporter,
} from '@opentelemetry/sdk-metrics'
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks'
import { resourceFromAttributes } from '@opentelemetry/resources'

// The single service identity + instrumentation-scope name (traces AND metrics).
const SERVICE_NAME = 'umbra-solver'

// ── Exporter selection (pure, testable) ──────────────────────────────────────────
// Returns the trace + metric exporters plus the selected `mode`. When `otlpEndpoint`
// is falsy (env var unset) the console exporters are chosen — the no-collector path.
export type ExporterMode = 'otlp' | 'console'
export interface SelectedExporters {
  mode: ExporterMode
  traceExporter: SpanExporter
  metricExporter: PushMetricExporter
}

export const selectExporters = (
  otlpEndpoint: string | undefined = process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
): SelectedExporters => {
  const useOtlp = typeof otlpEndpoint === 'string' && otlpEndpoint.trim().length > 0
  // OTLP exporters auto-read OTEL_EXPORTER_OTLP_ENDPOINT — no explicit `url` needed.
  return useOtlp
    ? { mode: 'otlp', traceExporter: new OTLPTraceExporter(), metricExporter: new OTLPMetricExporter() }
    : { mode: 'console', traceExporter: new ConsoleSpanExporter(), metricExporter: new ConsoleMetricExporter() }
}

// ── Lazy meter + instruments (bind to the live provider, post-init) ──────────────
let _meter: Meter | null = null
const meter = (): Meter => (_meter ??= metrics.getMeter(SERVICE_NAME))

export interface Instruments {
  /** umbra.rounds.opened — a round entered the Open window. */
  roundsOpened: Counter
  /** umbra.clear.latency_ms — §8 clear-compute duration. */
  clearLatencyMs: Histogram
  /** umbra.settle.latency_ms — DvP settlement duration. */
  settleLatencyMs: Histogram
  /** umbra.agent.verified_total{source} — agent proposals verified against §8. */
  agentVerifiedTotal: Counter
  /** umbra.webhook.delivery_total{status} — webhook delivery outcomes. */
  webhookDeliveryTotal: Counter
}

let _instruments: Instruments | null = null
const buildInstruments = (): Instruments => {
  const m = meter()
  return {
    roundsOpened: m.createCounter('umbra.rounds.opened', {
      description: 'Rounds that entered the Open window',
    }),
    clearLatencyMs: m.createHistogram('umbra.clear.latency_ms', {
      description: 'Deterministic §8 clear-compute latency',
      unit: 'ms',
    }),
    settleLatencyMs: m.createHistogram('umbra.settle.latency_ms', {
      description: 'Atomic DvP settlement latency',
      unit: 'ms',
    }),
    agentVerifiedTotal: m.createCounter('umbra.agent.verified_total', {
      description: 'Agent proposals that matched the deterministic §8 clear',
    }),
    webhookDeliveryTotal: m.createCounter('umbra.webhook.delivery_total', {
      description: 'Webhook delivery outcomes by status',
    }),
  }
}

// Exported as a stable const (contract) but resolved lazily — the first property
// access builds the instruments from the meter that is live at that moment. Any
// access AFTER initTelemetry() binds to the registered MeterProvider (console or OTLP).
export const instruments: Instruments = new Proxy({} as Instruments, {
  get(_target, prop: string | symbol): unknown {
    _instruments ??= buildInstruments()
    return _instruments[prop as keyof Instruments]
  },
})

// ── Boot-once providers (mirror agent.ts `_client`) ──────────────────────────────
let _tracerProvider: BasicTracerProvider | null = null
let _meterProvider: MeterProvider | null = null
let _contextManagerSet = false

export interface TelemetryOverrides {
  /** Force the OTLP endpoint decision (else read from process.env). */
  otlpEndpoint?: string
  /** Inject a trace exporter (test/OTLP override). Ignored if `spanProcessors` set. */
  traceExporter?: SpanExporter
  /** Inject span processors directly (tests use SimpleSpanProcessor + InMemory). */
  spanProcessors?: SpanProcessor[]
  /** Inject a metric reader (tests use an InMemory-backed reader). */
  metricReader?: IMetricReader
}

// Pick a span processor for the selected exporter: SimpleSpanProcessor for the console
// path (immediate, human-visible in dev) and BatchSpanProcessor for OTLP (batched network
// export in prod). Overridable via TelemetryOverrides.spanProcessors (tests).
const processorFor = (mode: ExporterMode, exporter: SpanExporter): SpanProcessor =>
  mode === 'otlp' ? new BatchSpanProcessor(exporter) : new SimpleSpanProcessor(exporter)

// Initialise telemetry exactly once. A second call is a no-op that returns early
// (boot-once). Resets the lazy meter/instrument caches AFTER registration so the exported
// `instruments` bind to the freshly-registered global MeterProvider (console or OTLP).
export function initTelemetry(overrides: TelemetryOverrides = {}): void {
  if (_tracerProvider) return

  const selected = selectExporters(overrides.otlpEndpoint)
  const resource = resourceFromAttributes({ 'service.name': SERVICE_NAME })

  // ── Traces ──
  const spanProcessors: SpanProcessor[] =
    overrides.spanProcessors ??
    [processorFor(selected.mode, overrides.traceExporter ?? selected.traceExporter)]
  const tracerProvider = new BasicTracerProvider({ resource, spanProcessors })
  trace.setGlobalTracerProvider(tracerProvider)

  // Context propagation across `await` (getActiveSpan for logger trace.id + nested spans).
  if (!_contextManagerSet) {
    context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable())
    _contextManagerSet = true
  }

  // ── Metrics ──
  const metricReader: IMetricReader =
    overrides.metricReader ??
    new PeriodicExportingMetricReader({ exporter: selected.metricExporter })
  const meterProvider = new MeterProvider({ resource, readers: [metricReader] })
  metrics.setGlobalMeterProvider(meterProvider)

  _tracerProvider = tracerProvider
  _meterProvider = meterProvider
  // Rebind lazy meter/instruments to the now-registered global provider.
  _meter = null
  _instruments = null
}

// Flush + tear down the providers (SIGTERM). Safe to call when telemetry was never started.
export async function shutdownTelemetry(): Promise<void> {
  const tp = _tracerProvider
  const mp = _meterProvider
  _tracerProvider = null
  _meterProvider = null
  _meter = null
  _instruments = null
  if (tp) await tp.shutdown()
  if (mp) await mp.shutdown()
}

// ── withSpan — run `fn` inside an active, round-correlated span ───────────────────
// Sets `round.id` on the span; a `ledger.*`-named span is a CLIENT span (JSON Ledger
// API v2 call, not in-participant). On a thrown error the span is marked ERROR (with
// err.name only — never err.message/the raw object) and re-raised; the span always ends.
export interface SpanOptions {
  /** Override the span kind (defaults to CLIENT for `ledger.*`, else INTERNAL). */
  kind?: SpanKind
}

const defaultKind = (name: string): SpanKind =>
  name.startsWith('ledger.') ? SpanKind.CLIENT : SpanKind.INTERNAL

export function withSpan<T>(
  name: string,
  roundId: string,
  fn: (span: Span) => T | Promise<T>,
  opts: SpanOptions = {},
): Promise<T> {
  const tracer = trace.getTracer(SERVICE_NAME)
  const kind = opts.kind ?? defaultKind(name)
  return tracer.startActiveSpan(name, { kind }, async (span) => {
    span.setAttribute('round.id', roundId)
    try {
      return await fn(span)
    } catch (err) {
      // Secret-free: record only the error class name, never err.message / the object.
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.name : 'unknown',
      })
      throw err
    } finally {
      span.end()
    }
  })
}
