import type { FastifyInstance } from "fastify";
import {
  canAccessRoom,
  getMessageSenderId,
  getOrCreateDmRoom,
  getRoomBroadcastUserIds,
  insertMessage,
  listColleagues,
  listMessages,
  listRoomsForUser,
  markDelivered,
  markRoomRead,
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

      // Ha most kérte le először ezeket az üzeneteket, kézbesítettnek
      // számítanak (akkor is, ha korábban offline volt).
      for (const msg of messages) {
        if (msg.sender_id !== request.user.sub && !msg.delivered_at) {
          await markDelivered(msg.id, request.user.sub);
        }
      }

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

      if (frame.type === "typing") {
        if (!frame.roomId) return;
        const allowed = await canAccessRoom(frame.roomId, userId);
        if (!allowed) return;
        const recipientIds = await getRoomBroadcastUserIds(frame.roomId);
        broadcastToUsers(
          recipientIds.filter((id) => id !== userId),
          { type: "typing", roomId: frame.roomId, fromUserId: userId }
        );
        return;
      }

      if (frame.type === "delivered") {
        if (!frame.messageId) return;
        const senderId = await getMessageSenderId(frame.messageId);
        if (!senderId || senderId === userId) return;
        await markDelivered(frame.messageId, userId);
        sendToUser(senderId, { type: "receipt", messageId: frame.messageId, userId, delivered: true, read: false });
        return;
      }

      if (frame.type === "read-room") {
        if (!frame.roomId) return;
        const allowed = await canAccessRoom(frame.roomId, userId);
        if (!allowed) return;
        const results = await markRoomRead(frame.roomId, userId);
        const senderIds = Array.from(new Set(results.map((r) => r.senderId)));
        for (const senderId of senderIds) {
          if (senderId === userId) continue;
          sendToUser(senderId, { type: "receipts-bulk", roomId: frame.roomId, readerId: userId });
        }
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
