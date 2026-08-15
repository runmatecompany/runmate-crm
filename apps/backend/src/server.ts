import { buildApp } from "./app.js";
import { config } from "./config.js";
import { syncGoogleCalendar } from "./lib/googleCalendar/sync.js";
import { provisionCurrentMonthFoldersForAllClients } from "./lib/googleDrive/monthlyProvisioning.js";

const app = buildApp();

const GOOGLE_CALENDAR_SYNC_INTERVAL_MS = 5 * 60 * 1000;
const DRIVE_MONTH_PROVISION_INTERVAL_MS = 24 * 60 * 60 * 1000;

app
  .listen({ port: config.port, host: config.host })
  .then((address) => {
    app.log.info(`Backend listening on ${address}`);
    void syncGoogleCalendar().catch((err) => app.log.error(err, "Google Calendar sync failed"));
    setInterval(() => {
      void syncGoogleCalendar().catch((err) => app.log.error(err, "Google Calendar sync failed"));
    }, GOOGLE_CALENDAR_SYNC_INTERVAL_MS);

    void provisionCurrentMonthFoldersForAllClients().catch((err) =>
      app.log.error(err, "Drive monthly folder provisioning failed")
    );
    setInterval(() => {
      void provisionCurrentMonthFoldersForAllClients().catch((err) =>
        app.log.error(err, "Drive monthly folder provisioning failed")
      );
    }, DRIVE_MONTH_PROVISION_INTERVAL_MS);
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
