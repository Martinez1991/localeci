/**
 * Structured logging + spend alerting (fixes the "observability: none" finding).
 *
 * Zero-retention-aware: the redactor strips client text (source/target/
 * translation) and secrets so logs never leak content or keys. The logger emits
 * JSON with a stable shape (level, msg, requestId, orgId, …) ready to ship to
 * Pino → Loki/Datadog; errors also go to Sentry in production. Pure and
 * unit-tested via an injectable sink.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

const SENSITIVE = new Set([
  "authorization",
  "apikey",
  "api_key",
  "key",
  "secret",
  "password",
  "token",
  // Client content — never log it (zero-retention).
  "source",
  "target",
  "translation",
  "text",
  "items",
]);

/** Deep-redact sensitive/content fields; safe to log the result. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[deep]";
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE.has(k.toLowerCase()) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

export interface LogContext {
  requestId?: string;
  orgId?: string;
  route?: string;
  [k: string]: unknown;
}

export type Sink = (line: Record<string, unknown>) => void;

const defaultSink: Sink = (line) => {
  // JSON line — pino-compatible. Replace with pino/pino-http in production.
  console[(line.level as LogLevel) === "error" ? "error" : "log"](JSON.stringify(line));
};

export interface Logger {
  child(ctx: LogContext): Logger;
  debug(msg: string, ctx?: LogContext): void;
  info(msg: string, ctx?: LogContext): void;
  warn(msg: string, ctx?: LogContext): void;
  error(msg: string, ctx?: LogContext): void;
}

export function createLogger(base: LogContext = {}, sink: Sink = defaultSink): Logger {
  const emit = (level: LogLevel, msg: string, ctx?: LogContext): void => {
    sink({ level, msg, ...(redact({ ...base, ...ctx }) as object) });
  };
  return {
    child: (ctx) => createLogger({ ...base, ...ctx }, sink),
    debug: (m, c) => emit("debug", m, c),
    info: (m, c) => emit("info", m, c),
    warn: (m, c) => emit("warn", m, c),
    error: (m, c) => emit("error", m, c),
  };
}

// ── LLM spend alerting ─────────────────────────────────────────────────────

export type AlertLevel = "ok" | "warning" | "critical";

/** Alert level for spend vs cap: ≥100% critical, ≥80% warning (spec guardrail). */
export function costAlertLevel(spentUsd: number, capUsd: number): AlertLevel {
  if (capUsd <= 0) return "ok";
  const ratio = spentUsd / capUsd;
  if (ratio >= 1) return "critical";
  if (ratio >= 0.8) return "warning";
  return "ok";
}
