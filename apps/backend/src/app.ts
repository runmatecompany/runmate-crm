import cors from "@fastify/cors";
import formbody from "@fastify/formbody";
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
import adminUserAccessRoutes from "./routes/admin/userAccess.js";

export function buildApp() {
  // Az alapértelmezett 1 MB-os body limit kevés lenne egy base64-kódolt
  // profilképhez, ezért ezt kicsit megemeljük.
  const app = Fastify({ logger: true, bodyLimit: 5 * 1024 * 1024 });

  // Dev: engedjük a Tauri webview / Vite dev szerver origin-jét.
  // Élesben érdemes konkrét origin(ek)re szűkíteni.
  app.register(cors, { origin: true });
  app.register(websocket);
  // A publikus jóváhagyó oldal sima HTML <form>-ot postol
  // (application/x-www-form-urlencoded), nem JSON-t.
  app.register(formbody);

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
  app.register(adminUserAccessRoutes);

  app.get("/health", async () => ({ status: "ok" }));

  return app;
}
