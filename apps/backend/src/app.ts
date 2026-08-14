import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import Fastify from "fastify";
import jwtPlugin from "./plugins/jwt.js";
import authRoutes from "./routes/auth.js";
import adminUsersRoutes from "./routes/admin/users.js";
import chatRoutes from "./routes/chat.js";
import adminChatRoutes from "./routes/admin/chat.js";

export function buildApp() {
  const app = Fastify({ logger: true });

  // Dev: engedjük a Tauri webview / Vite dev szerver origin-jét.
  // Élesben érdemes konkrét origin(ek)re szűkíteni.
  app.register(cors, { origin: true });
  app.register(websocket);

  app.register(jwtPlugin);
  app.register(authRoutes);
  app.register(adminUsersRoutes);
  app.register(chatRoutes);
  app.register(adminChatRoutes);

  app.get("/health", async () => ({ status: "ok" }));

  return app;
}
