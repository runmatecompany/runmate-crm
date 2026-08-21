import type { FastifyInstance } from "fastify";
import { getUserAvatar, getUserById, setUserAvatar, updateUserName, updateUserPhone } from "../db/users.js";
import { disconnectUserDrive, getUserDriveConnectionStatus } from "../db/userGoogleDrive.js";
import { getPersonalAuthUrl } from "../lib/googleDrive/personalOauth.js";
import { GoogleCalendarNotConfiguredError } from "../lib/googleCalendar/oauth.js";
import { broadcastToAll } from "../realtime/connections.js";

const updateNameBodySchema = {
  type: "object",
  required: ["name"],
  properties: {
    name: { type: "string", minLength: 1, maxLength: 100 },
  },
} as const;

const updatePhoneBodySchema = {
  type: "object",
  properties: {
    phone: { type: "string", maxLength: 40 },
  },
} as const;

const uploadAvatarBodySchema = {
  type: "object",
  required: ["dataUrl"],
  properties: {
    // Kb. 2 MB nyers kép a base64 többlettel együtt — bőven elég egy
    // kliens oldalon már átméretezett profilképhez.
    dataUrl: { type: "string", maxLength: 3_000_000 },
  },
} as const;

const DATA_URL_PATTERN = /^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/;

export default async function meRoutes(fastify: FastifyInstance) {
  fastify.get("/me", { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const user = await getUserById(request.user.sub);
    if (!user) {
      return reply.code(404).send({ error: "User not found" });
    }
    return { user };
  });

  fastify.patch<{ Body: { name: string } }>(
    "/me",
    { onRequest: [fastify.authenticate], schema: { body: updateNameBodySchema } },
    async (request, reply) => {
      const user = await updateUserName(request.user.sub, request.body.name.trim());
      if (!user) {
        return reply.code(404).send({ error: "User not found" });
      }
      broadcastToAll({ type: "profile-updated", userId: user.id, name: user.name });
      return { user };
    }
  );

  fastify.patch<{ Body: { phone?: string } }>(
    "/me/phone",
    { onRequest: [fastify.authenticate], schema: { body: updatePhoneBodySchema } },
    async (request, reply) => {
      const trimmed = request.body.phone?.trim();
      const user = await updateUserPhone(request.user.sub, trimmed ? trimmed : null);
      if (!user) {
        return reply.code(404).send({ error: "User not found" });
      }
      broadcastToAll({ type: "profile-updated", userId: user.id, phone: user.phone });
      return { user };
    }
  );

  fastify.post<{ Body: { dataUrl: string } }>(
    "/me/avatar",
    { onRequest: [fastify.authenticate], schema: { body: uploadAvatarBodySchema } },
    async (request, reply) => {
      const match = request.body.dataUrl.match(DATA_URL_PATTERN);
      if (!match) {
        return reply.code(400).send({ error: "Érvénytelen kép formátum" });
      }
      const [, mime, base64] = match;
      const data = Buffer.from(base64, "base64");
      await setUserAvatar(request.user.sub, mime, data);
      broadcastToAll({ type: "profile-updated", userId: request.user.sub, avatarChanged: true });
      return { ok: true };
    }
  );

  // Vágónkénti, önálló Google Drive-kapcsolat — nem admin-funkció, bárki
  // önkiszolgáló módon összekötheti a saját fiókját a Profilom oldalon,
  // hogy gyorsabban (a RunMate szerver megkerülésével) tudjon klipeket
  // feltölteni a Content Kanbanban.
  fastify.get("/me/google-drive/status", { onRequest: [fastify.authenticate] }, async (request) => {
    return getUserDriveConnectionStatus(request.user.sub);
  });

  fastify.get("/me/google-drive/auth-url", { onRequest: [fastify.authenticate] }, async (request, reply) => {
    try {
      return { url: getPersonalAuthUrl(request.user.sub) };
    } catch (err) {
      if (err instanceof GoogleCalendarNotConfiguredError) {
        return reply.code(503).send({ error: err.message });
      }
      throw err;
    }
  });

  fastify.post("/me/google-drive/disconnect", { onRequest: [fastify.authenticate] }, async (request) => {
    await disconnectUserDrive(request.user.sub);
    return { ok: true };
  });

  fastify.get<{ Params: { id: string } }>("/users/:id/avatar", { onRequest: [fastify.authenticate] }, async (
    request,
    reply
  ) => {
    const avatar = await getUserAvatar(Number(request.params.id));
    if (!avatar) {
      return reply.code(404).send();
    }
    reply.header("Content-Type", avatar.mime);
    reply.header("Cache-Control", "private, max-age=300");
    return reply.send(avatar.data);
  });
}
