import * as Sentry from "@sentry/cloudflare";
import handler from "vinext/server/app-router-entry";

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    enabled: Boolean(env.SENTRY_DSN),
    environment: env.SENTRY_ENVIRONMENT,
    enableLogs: true,
    tracesSampleRate: 1,
    sendDefaultPii: false,
  }),
  {
    fetch(request, env, ctx) {
      return handler.fetch(request, env, ctx);
    },
  } satisfies ExportedHandler<Env>,
);
