import { config, validateRuntimeConfig } from "./config";
import app from "./app";

validateRuntimeConfig();

app.listen(config.port, () => {
  console.log(`Log API running on port ${config.port} [${config.nodeEnv}]`);
});
