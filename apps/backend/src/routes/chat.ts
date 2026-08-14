import type { FastifyInstance } from "fastify";
import {
  getOrCreateDmRoom,
  getRoomMemberIds,
  insertMessage,
  isRoomMember,
  listColleagues,
  listMessages,
  listRoomsForUser,
} from "../db/chat.js";
import { registerConnection, unregisterConnection, broadcastToUsers } from "../realtime/connections.js";
import type { JwtUserPayload } from "../plugins/jwt.js";

interface IncomingChatFrame {
  type: "message";
  roomId: number;
  body: string;
}

export default async function chatRoutes(fastify: FastifyInstance) {
  fastify.get("/chat/rooms", { onRequest: [fastify.authenticate] }, async (request) => {
    const rooms = await listRoomsForUser(request.user.sub);
    return { rooms };
  });

  fastify.get("/chat/users", { onRequest: [fastify.authenticate] }, async () => {
    return { users: await listColleagues() };
  });

  fastify.get<{ Params: { id: string }; Querystring: { before?: string; limit?: string } }>(
    "/chat/rooms/:id/messages",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const roomId = Number(request.params.id);
      const member = await isRoomMember(roomId, request.user.sub);
      if (!member) {
        return reply.code(403).send({ error: "Nem vagy tagja ennek a szobának" });
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
      registerConnection(userId, socket);
    } catch {
      socket.close(4001, "Invalid token");
      return;
    }

    socket.on("message", async (raw: Buffer) => {
      if (!userId) return;
      let frame: IncomingChatFrame;
      try {
        frame = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (frame.type !== "message" || !frame.roomId || !frame.body?.trim()) return;

      const member = await isRoomMember(frame.roomId, userId);
      if (!member) return;

      const message = await insertMessage(frame.roomId, userId, frame.body.trim());
      const memberIds = await getRoomMemberIds(frame.roomId);
      broadcastToUsers(memberIds, { type: "message", message });
    });

    socket.on("close", () => {
      if (userId) unregisterConnection(userId, socket);
    });
  });
}
