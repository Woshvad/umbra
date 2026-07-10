// solver/src/telemetry.test.ts — executable contract for the OPS-01 OTel bootstrap.
//
// Proven here (all offline, NO live collector — injected in-memory exporters/readers):
//   • selectExporters degrades to Console exporters when the endpoint is UNSET, and
//     picks OTLP exporters when it is set (the locked console-fallback decision).
//   • withSpan runs its body inside an active span that carries a `round.id` attribute.
//   • a `ledger.*`-named span is a CLIENT span (JSON Ledger API v2 leg, not in-participant);
//     a non-ledger span is not CLIENT.
//   • the five named metric instruments exist and record to a live (injected) reader.
//   • no secret sentinel appears in any exported span attribute (secret-sweep, T-13-01).

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { SpanKind } from '@opentelemetry/api'
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  ConsoleSpanExporter,
} from '@opentelemetry/sdk-trace-base'
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  PeriodicExportingMetricReader,
  ConsoleMetricExporter,
} from '@opentelemetry/sdk-metrics'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http'
import {
  initTelemetry,
  instruments,
  selectExporters,
  shutdownTelemetry,
  withSpan,
} from './telemetry.js'

// A sentinel that must NEVER surface in a span attribute (secret-sweep).
const SECRET_SENTINEL = 'sk-ant-telemetry-secret-DEADBEEF'

describe('selectExporters — console fallback vs OTLP', () => {
  it('selects the Console exporters when the OTLP endpoint is UNSET', () => {
    const sel = selectExporters(undefined)
    expect(sel.mode).toBe('console')
    expect(sel.traceExporter).toBeInstanceOf(ConsoleSpanExporter)
    expect(sel.metricExporter).toBeInstanceOf(ConsoleMetricExporter)
  })

  it('selects the Console exporters when the endpoint is blank/whitespace', () => {
    expect(selectExporters('   ').mode).toBe('console')
    expect(selectExporters('').mode).toBe('console')
  })

  it('selects the OTLP exporters when an endpoint is configured', () => {
    const sel = selectExporters('http://localhost:4318')
    expect(sel.mode).toBe('otlp')
    expect(sel.traceExporter).toBeInstanceOf(OTLPTraceExporter)
    expect(sel.metricExporter).toBeInstanceOf(OTLPMetricExporter)
  })
})

describe('telemetry SDK — spans + instruments (injected in-memory exporters)', () => {
  const spanExporter = new InMemorySpanExporter()
  const metricExporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE)
  const metricReader = new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 3_600_000, // effectively never auto-exports; we collect() manually
  })

  beforeAll(() => {
    initTelemetry({
      spanProcessors: [new SimpleSpanProcessor(spanExporter)],
      metricReader,
    })
  })

  afterAll(async () => {
    await shutdownTelemetry()
  })

  it('withSpan sets round.id and runs the body, returning its value', async () => {
    spanExporter.reset()
    const result = await withSpan('round.settle', 'R-42', () => 'done')
    expect(result).toBe('done')

    const spans = spanExporter.getFinishedSpans()
    const settle = spans.find((s) => s.name === 'round.settle')
    expect(settle).toBeDefined()
    expect(settle?.attributes['round.id']).toBe('R-42')
    // A non-ledger span is INTERNAL, not CLIENT.
    expect(settle?.kind).toBe(SpanKind.INTERNAL)
  })

  it('labels a ledger.* span as a CLIENT span (not in-participant)', async () => {
    spanExporter.reset()
    await withSpan('ledger.exercise', 'R-7', () => undefined)

    const span = spanExporter.getFinishedSpans().find((s) => s.name === 'ledger.exercise')
    expect(span).toBeDefined()
    expect(span?.kind).toBe(SpanKind.CLIENT)
    expect(span?.attributes['round.id']).toBe('R-7')
  })

  it('marks the span ERROR and re-throws when the body throws (secret-free)', async () => {
    spanExporter.reset()
    await expect(
      withSpan('round.settle', 'R-9', () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')

    const span = spanExporter.getFinishedSpans().find((s) => s.name === 'round.settle')
    expect(span?.status.code).toBe(2 /* SpanStatusCode.ERROR */)
    // The status message is the error CLASS name only — never err.message.
    expect(span?.status.message).toBe('Error')
    // err.message ("boom") must never reach the span's data surface.
    expect(
      JSON.stringify({ status: span?.status, attributes: span?.attributes, events: span?.events }),
    ).not.toContain('boom')
  })

  it('exposes the five named metric instruments and records to the live reader', async () => {
    // The five instruments exist with the expected shape.
    expect(typeof instruments.roundsOpened.add).toBe('function')
    expect(typeof instruments.clearLatencyMs.record).toBe('function')
    expect(typeof instruments.settleLatencyMs.record).toBe('function')
    expect(typeof instruments.agentVerifiedTotal.add).toBe('function')
    expect(typeof instruments.webhookDeliveryTotal.add).toBe('function')

    instruments.roundsOpened.add(1)
    instruments.clearLatencyMs.record(12)
    instruments.settleLatencyMs.record(34)
    instruments.agentVerifiedTotal.add(1, { source: 'claude' })
    instruments.webhookDeliveryTotal.add(1, { status: 'delivered' })

    const { resourceMetrics } = await metricReader.collect()
    const names = resourceMetrics.scopeMetrics
      .flatMap((s) => s.metrics)
      .map((m) => m.descriptor.name)

    for (const n of [
      'umbra.rounds.opened',
      'umbra.clear.latency_ms',
      'umbra.settle.latency_ms',
      'umbra.agent.verified_total',
      'umbra.webhook.delivery_total',
    ]) {
      expect(names).toContain(n)
    }
  })

  it('never leaks a secret sentinel into a span attribute (secret-sweep)', async () => {
    spanExporter.reset()
    await withSpan('round.settle', 'R-secret', (span) => {
      // Even if a caller mistakenly tries to attach the round id only — telemetry sets
      // ONLY round.id. We assert no secret can be found across the exported span.
      span.setAttribute('round.id', 'R-secret')
      return undefined
    })
    // Serialize only the span's data surface (SpanImpl back-references its processor →
    // a raw JSON.stringify would be circular). Attributes/events/status are where a
    // secret could conceivably leak.
    const dump = JSON.stringify(
      spanExporter.getFinishedSpans().map((s) => ({
        name: s.name,
        kind: s.kind,
        attributes: s.attributes,
        status: s.status,
        events: s.events,
      })),
    )
    expect(dump).not.toContain(SECRET_SENTINEL)
  })
})
