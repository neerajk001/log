import * as Sentry from "@sentry/node";
import { config } from "./config";

let initialized = false;

/**
 * Initializes Sentry error monitoring. No-op when SENTRY_DSN is unset, so
 * local dev and CI stay quiet. Call once from `index.ts` before listening.
 */
export function initSentry(): void {
  if (initialized || !config.sentry.dsn) {
    if (!config.sentry.dsn) {
      console.warn("[sentry] SENTRY_DSN not set — error reporting disabled");
    }
    return;
  }

  Sentry.init({
    dsn: config.sentry.dsn,
    environment: config.sentry.environment,
    release: config.sentry.release,
    // Error monitoring only — no performance tracing (quota discipline).
    tracesSampleRate: 0,
    beforeSend(event) {
      // Never ship auth material or request bodies (weight, meals, plan text,
      // coach notes) even if capture settings change later.
      if (event.request) {
        delete event.request.data;
        delete event.request.query_string;
        delete event.request.cookies;
      }
      const headers = event.request?.headers as Record<string, unknown> | undefined;
      if (headers) {
        delete headers.authorization;
        delete headers.Authorization;
        delete headers.cookie;
      }
      return event;
    },
  });

  initialized = true;
  console.log(`[sentry] enabled [${config.sentry.environment}]`);
}

export function isSentryEnabled(): boolean {
  return initialized;
}
