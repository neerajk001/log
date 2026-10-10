import { initSentry } from "./sentry";
import { config, validateRuntimeConfig } from "./config";
import app from "./app";

initSentry();
validateRuntimeConfig();

console.log(
  `AI provider: ${config.ai.baseUrl} (chat=${config.models.chatFast}, meal=${config.models.meal}, chaining=${config.ai.chaining})`,
);

app.listen(config.port, () => {
  console.log(`Log API running on port ${config.port} [${config.nodeEnv}]`);
});
