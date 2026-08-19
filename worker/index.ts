import * as Sentry from "@sentry/cloudflare";
import handler from "vinext/server/app-router-entry";

type SentryEnv = Env & { SENTRY_DSN?: string };

export default Sentry.withSentry(
  (env: SentryEnv) => ({
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
  } satisfies ExportedHandler<SentryEnv>,
);
