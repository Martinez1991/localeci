/**
 * Next.js instrumentation hook (issue #9). Loads the right Sentry config per
 * runtime. Reference implementation; needs @sentry/nextjs.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config.js");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config.js");
  }
}
