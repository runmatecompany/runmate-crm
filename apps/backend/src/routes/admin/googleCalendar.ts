import type { FastifyInstance } from "fastify";
import { disconnectCalendar, getConnectionStatus } from "../../db/googleCalendar.js";
import { getAuthUrl, GoogleCalendarNotConfiguredError } from "../../lib/googleCalendar/oauth.js";

export default async function adminGoogleCalendarRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", fastify.requireAdmin);

  fastify.get("/admin/google-calendar/status", async () => {
    return getConnectionStatus();
  });

  fastify.get("/admin/google-calendar/auth-url", async (_request, reply) => {
    try {
      return { url: getAuthUrl() };
    } catch (err) {
      if (err instanceof GoogleCalendarNotConfiguredError) {
        return reply.code(400).send({ error: err.message });
      }
      throw err;
    }
  });

  fastify.post("/admin/google-calendar/disconnect", async (_request, reply) => {
    await disconnectCalendar();
    return reply.send({ ok: true });
  });
}
