import cors from "@fastify/cors";
import formbody from "@fastify/formbody";
import multipart from "@fastify/multipart";
import websocket from "@fastify/websocket";
import Fastify from "fastify";
import jwtPlugin from "./plugins/jwt.js";
import authRoutes from "./routes/auth.js";
import adminUsersRoutes from "./routes/admin/users.js";
import chatRoutes from "./routes/chat.js";
import adminChatRoutes from "./routes/admin/chat.js";
import meRoutes from "./routes/me.js";
import emailAccountsRoutes from "./routes/emailAccounts.js";
import adminEmailAccountsRoutes from "./routes/admin/emailAccounts.js";
import leadsRoutes from "./routes/leads.js";
import clientsRoutes from "./routes/clients.js";
import contentItemsRoutes from "./routes/contentItems.js";
import socialMediaApprovalRoutes from "./routes/socialMediaApproval.js";
import adminSocialMediaConfigRoutes from "./routes/admin/socialMediaConfig.js";
import googleCalendarOauthRoutes from "./routes/googleCalendarOauth.js";
import adminGoogleCalendarRoutes from "./routes/admin/googleCalendar.js";
import calendarFileRoutes from "./routes/calendarFile.js";
import googleDriveRoutes from "./routes/googleDrive.js";
import adminUserAccessRoutes from "./routes/admin/userAccess.js";

export function buildApp() {
  // Az alapértelmezett 1 MB-os body limit kevés lenne egy base64-kódolt
  // profilképhez, ezért ezt kicsit megemeljük. A maxParamLength (find-my-way
  // alapértelmezetten 100 karakter) is kevés lenne a Google Naptár .ics
  // linkek aláírt tokenjéhez (lib/googleCalendar/icsToken.ts).
  const app = Fastify({ logger: true, bodyLimit: 5 * 1024 * 1024, maxParamLength: 300 });

  // Dev: engedjük a Tauri webview / Vite dev szerver origin-jét.
  // Élesben érdemes konkrét origin(ek)re szűkíteni.
  app.register(cors, { origin: true });
  app.register(websocket);
  // A publikus jóváhagyó oldal sima HTML <form>-ot postol
  // (application/x-www-form-urlencoded), nem JSON-t.
  app.register(formbody);
  // A nyersanyag-feltöltés (routes/contentItems.ts upload-raw) streamelt
  // multipart fájlokat fogad — a bodyLimit ide nem vonatkozik, ez saját
  // limitet kap (nagy videófájlokhoz bőven elég keret).
  app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 * 1024 } });

  app.register(jwtPlugin);
  app.register(authRoutes);
  app.register(adminUsersRoutes);
  app.register(chatRoutes);
  app.register(adminChatRoutes);
  app.register(meRoutes);
  app.register(emailAccountsRoutes);
  app.register(adminEmailAccountsRoutes);
  app.register(leadsRoutes);
  app.register(clientsRoutes);
  app.register(contentItemsRoutes);
  app.register(socialMediaApprovalRoutes);
  app.register(adminSocialMediaConfigRoutes);
  app.register(googleCalendarOauthRoutes);
  app.register(adminGoogleCalendarRoutes);
  app.register(calendarFileRoutes);
  app.register(googleDriveRoutes);
  app.register(adminUserAccessRoutes);

  app.get("/health", async () => ({ status: "ok" }));

  return app;
}
