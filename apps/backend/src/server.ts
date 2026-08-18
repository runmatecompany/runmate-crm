import { buildApp } from "./app.js";
import { config } from "./config.js";
import { syncGoogleCalendar } from "./lib/googleCalendar/sync.js";
import { provisionCurrentMonthFoldersForAllClients } from "./lib/googleDrive/monthlyProvisioning.js";
import { processNextLeadResearch } from "./lib/leadResearch/process.js";

const app = buildApp();

// Ez a szerver ténylegesen éles gépként fut (a kollégák ezen keresztül
// érik el Tailscale-en), nincs mögötte process-supervisor ami crash után
// automatikusan újraindítaná — egy kezeletlen promise-elutasítás vagy
// szinkron kivétel alapból leállítaná a teljes Node-folyamatot, ami a
// teljes szoftvert használhatatlanná tenné, amíg valaki manuálisan újra
// nem indítja. Naplózzuk és életben tartjuk a folyamatot helyette.
process.on("unhandledRejection", (reason) => {
  app.log.error(reason, "Kezeletlen promise-elutasítás — a szerver életben marad");
});
process.on("uncaughtException", (err) => {
  app.log.error(err, "Kezeletlen kivétel — a szerver életben marad");
});

const GOOGLE_CALENDAR_SYNC_INTERVAL_MS = 5 * 60 * 1000;
const DRIVE_MONTH_PROVISION_INTERVAL_MS = 24 * 60 * 60 * 1000;
// Nincs queue-infrastruktúra a rendszerben — ez a minta (rövid periódusú
// setInterval, ami legfeljebb 1 elemet dolgoz fel) ugyanaz, mint a Calendar
// szinkronnál/Drive provisioningnál. 15 mp elég gyors visszajelzést ad a
// UI-nak, mégsem terheli feleslegesen a szervert.
const LEAD_RESEARCH_INTERVAL_MS = 15 * 1000;

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

    setInterval(() => {
      void processNextLeadResearch().catch((err) => app.log.error(err, "Lead research processing failed"));
    }, LEAD_RESEARCH_INTERVAL_MS);
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
