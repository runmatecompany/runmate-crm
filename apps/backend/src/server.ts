import { buildApp } from "./app.js";
import { config } from "./config.js";
import { syncGoogleCalendar } from "./lib/googleCalendar/sync.js";

const app = buildApp();

const GOOGLE_CALENDAR_SYNC_INTERVAL_MS = 5 * 60 * 1000;

app
  .listen({ port: config.port, host: config.host })
  .then((address) => {
    app.log.info(`Backend listening on ${address}`);
    void syncGoogleCalendar().catch((err) => app.log.error(err, "Google Calendar sync failed"));
    setInterval(() => {
      void syncGoogleCalendar().catch((err) => app.log.error(err, "Google Calendar sync failed"));
    }, GOOGLE_CALENDAR_SYNC_INTERVAL_MS);
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
