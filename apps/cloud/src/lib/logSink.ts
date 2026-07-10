/**
 * Log sink that forwards to Sentry (issue #9). `error`-level lines are captured
 * as Sentry events; every line still goes to structured JSON (stdout → Vercel /
 * Loki / Datadog). Pure over injected sinks so it's unit-testable; the real
 * Sentry client is wired in `sentry.server.config.ts`.
 */
import type { Sink } from "./observability.js";

/** The slice of the Sentry SDK we use (so this file has no hard @sentry dep). */
export interface ErrorReporter {
  captureMessage(message: string, level?: "error" | "warning" | "info"): void;
}

/** A console sink emitting one JSON line (pino-compatible). */
export const consoleSink: Sink = (line) => {
  const s = JSON.stringify(line);
  if (line.level === "error") console.error(s);
  else console.log(s);
};

/**
 * Compose a sink that writes structured JSON AND forwards error/warn lines to an
 * error reporter (Sentry). Content is already redacted upstream by `createLogger`.
 */
export function sentrySink(reporter: ErrorReporter, base: Sink = consoleSink): Sink {
  return (line) => {
    base(line);
    if (line.level === "error") reporter.captureMessage(String(line.msg), "error");
    else if (line.level === "warn") reporter.captureMessage(String(line.msg), "warning");
  };
}
