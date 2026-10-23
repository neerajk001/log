import { initSentry } from "./sentry";
import { config, validateRuntimeConfig } from "./config";
import { prisma } from "./db/client";
import app from "./app";

initSentry();
validateRuntimeConfig();

console.log(
  `AI provider: ${config.ai.baseUrl} (chat=${config.models.chatFast}, meal=${config.models.meal}, mealPhoto=${config.models.mealVision}, chaining=${config.ai.chaining})`,
);

const server = app.listen(config.port, () => {
  console.log(`Log API running on port ${config.port} [${config.nodeEnv}]`);
});

/** Let in-flight requests finish before the container is killed. */
function shutdown(signal: string): void {
  console.log(`[shutdown] ${signal} received, draining connections`);
  const force = setTimeout(() => {
    console.error("[shutdown] drain timed out");
    process.exit(1);
  }, 10_000);
  force.unref();
  server.close(() => {
    void prisma.$disconnect().finally(() => {
      clearTimeout(force);
      process.exit(0);
    });
  });
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
