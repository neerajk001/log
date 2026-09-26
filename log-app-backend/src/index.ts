import { initSentry } from "./sentry";
import { config, validateRuntimeConfig } from "./config";
import app from "./app";

initSentry();
validateRuntimeConfig();

app.listen(config.port, () => {
  console.log(`Log API running on port ${config.port} [${config.nodeEnv}]`);
});
