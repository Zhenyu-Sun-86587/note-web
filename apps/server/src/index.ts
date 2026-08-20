import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const app = createApp(config);

app.listen(config.port, config.host, () => {
  // eslint-disable-next-line no-console
  console.log(`Note Web server listening on http://${config.host}:${config.port}`);
});
