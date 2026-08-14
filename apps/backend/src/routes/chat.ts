import type { FastifyInstance } from "fastify";
import {
  canAccessRoom,
  getOrCreateDmRoom,
  getRoomBroadcastUserIds,
  insertMessage,
  listColleagues,
  listMessages,
  listRoomsForUser,
} from "../db/chat.js";
import {
  registerConnection,
  unregisterConnection,
  broadcastToUsers,
  broadcastToAll,
  sendToUser,
  getOnlineUserIds,
} from "../realtime/connections.js";
import type { JwtUserPayload } from "../plugins/jwt.js";

const CALL_FRAME_TYPES = new Set(["call-offer", "call-answer", "call-ice-candidate", "call-end", "call-reject"]);

export default async function chatRoutes(fastify: FastifyInstance) {
  fastify.get("/chat/rooms", { onRequest: [fastify.authenticate] }, async (request) => {
    const rooms = await listRoomsForUser(request.user.sub);
    return { rooms };
  });

  fastify.get("/chat/users", { onRequest: [fastify.authenticate] }, async () => {
    return { users: await listColleagues() };
  });

  fastify.get("/chat/presence", { onRequest: [fastify.authenticate] }, async () => {
    return { onlineUserIds: getOnlineUserIds() };
  });

  fastify.get<{ Params: { id: string }; Querystring: { before?: string; limit?: string } }>(
    "/chat/rooms/:id/messages",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const roomId = Number(request.params.id);
      const allowed = await canAccessRoom(roomId, request.user.sub);
      if (!allowed) {
        return reply.code(403).send({ error: "Nincs hozzáférésed ehhez a szobához" });
      }
      const limit = request.query.limit ? Number(request.query.limit) : 50;
      const before = request.query.before ? Number(request.query.before) : undefined;
      const messages = await listMessages(roomId, limit, before);
      return { messages };
    }
  );

  fastify.post<{ Params: { userId: string } }>(
    "/chat/dm/:userId",
    { onRequest: [fastify.authenticate] },
    async (request) => {
      const otherUserId = Number(request.params.userId);
      const roomId = await getOrCreateDmRoom(request.user.sub, otherUserId);
      return { roomId };
    }
  );

  fastify.get("/chat/ws", { websocket: true }, (connection: any, req) => {
    const socket = connection.socket ?? connection;

    let userId: number | null = null;

    const token = (req.query as { token?: string } | undefined)?.token;
    if (!token) {
      socket.close(4001, "Missing token");
      return;
    }

    try {
      const payload = fastify.jwt.verify<JwtUserPayload>(token);
      userId = payload.sub;
      const wentOnline = registerConnection(userId, socket);
      if (wentOnline) {
        broadcastToAll({ type: "presence-changed", userId, online: true });
      }
    } catch {
      socket.close(4001, "Invalid token");
      return;
    }

    socket.on("message", async (raw: Buffer) => {
      if (!userId) return;
      let frame: any;
      try {
        frame = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (CALL_FRAME_TYPES.has(frame.type)) {
        if (!frame.roomId || !frame.targetUserId) return;
        const allowed = await canAccessRoom(frame.roomId, userId);
        if (!allowed) return;
        sendToUser(frame.targetUserId, { ...frame, fromUserId: userId });
        return;
      }

      if (frame.type !== "message" || !frame.roomId || !frame.body?.trim()) return;

      const allowed = await canAccessRoom(frame.roomId, userId);
      if (!allowed) return;

      const message = await insertMessage(frame.roomId, userId, frame.body.trim());
      const recipientIds = await getRoomBroadcastUserIds(frame.roomId);
      broadcastToUsers(recipientIds, { type: "message", message });
    });

    socket.on("close", () => {
      if (!userId) return;
      const wentOffline = unregisterConnection(userId, socket);
      if (wentOffline) {
        broadcastToAll({ type: "presence-changed", userId, online: false });
      }
    });
  });
}
