/**
 * Sentry (issue #9) — server runtime. The structured logger already redacts
 * content/secrets; `sentrySink` (src/lib/logSink.ts) forwards error/warn lines
 * here. Reference implementation; needs @sentry/nextjs.
 */
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? "development",
  tracesSampleRate: 0.1,
  // Never send request bodies / headers that could contain client strings or keys.
  sendDefaultPii: false,
  beforeSend(event) {
    if (event.request) {
      delete event.request.data;
      delete event.request.cookies;
      if (event.request.headers) delete event.request.headers.authorization;
    }
    return event;
  },
});
