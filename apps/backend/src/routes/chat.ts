import type { FastifyInstance } from "fastify";
import {
  canAccessRoom,
  clearRoomHistory,
  getMessageImage,
  getMessageRoomId,
  getMessageSenderId,
  getOrCreateDmRoom,
  getOtherDmMember,
  getRoomBroadcastUserIds,
  getRoomMeta,
  insertMessage,
  listColleagues,
  listMessages,
  listRoomsForUser,
  markDelivered,
  markRoomRead,
  restoreRoomHistory,
} from "../db/chat.js";
import {
  registerConnection,
  unregisterConnection,
  broadcastToUsers,
  broadcastToAll,
  sendToUser,
  getOnlineUserIds,
} from "../realtime/connections.js";
import {
  getAllActiveCalls,
  getParticipants,
  joinCall,
  leaveAllCallsForSocket,
  leaveCall,
  setCameraState,
  setScreenSharing,
} from "../realtime/calls.js";
import type { JwtUserPayload } from "../plugins/jwt.js";

// Páronkénti WebRTC-egyeztetés (offer/answer/ice) — a hívó fél maga adja meg,
// kivel egyeztet (targetUserId), a szerver csak relézi. Ugyanez a mintázat
// szolgálja ki mind a DM, mind a csoportos (mesh) hívást.
const CALL_RELAY_FRAME_TYPES = new Set(["call-offer", "call-answer", "call-ice-candidate"]);

async function broadcastCallRoster(roomId: number): Promise<void> {
  const recipientIds = await getRoomBroadcastUserIds(roomId);
  broadcastToUsers(recipientIds, { type: "call-roster-updated", roomId, participants: getParticipants(roomId) });
}

// DM-nél bármelyik résztvevő törölheti/állíthatja vissza a saját beszélgetését,
// csoportszobánál (céges csatorna, mindenki látja) csak admin — nehogy
// véletlenül bárki kitörölje mindenki előzményét.
async function canClearRoom(roomId: number, userId: number, role: "admin" | "user"): Promise<boolean> {
  const meta = await getRoomMeta(roomId);
  if (!meta) return false;
  if (meta.is_dm) return canAccessRoom(roomId, userId);
  return role === "admin";
}

const sendImageBodySchema = {
  type: "object",
  required: ["dataUrl"],
  properties: {
    // A kliens átméretezi feltöltés előtt (max ~1600px, jpeg), ez a keret
    // bőven elég egy fotónak is, a globális 5 MB-os body limit alatt marad.
    dataUrl: { type: "string", maxLength: 4_500_000 },
    body: { type: "string", maxLength: 2000 },
  },
} as const;

const IMAGE_DATA_URL_PATTERN = /^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/;

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

  // Snapshot az összes, a felhasználó számára látható szoba aktív hívásairól —
  // kapcsolódáskor/reconnectkor tölti be a szobalista és a fejléc badge-eket,
  // utána a call-roster-updated WS frame-ek tartják élőben.
  fastify.get("/chat/calls", { onRequest: [fastify.authenticate] }, async (request) => {
    const accessibleRoomIds = (await listRoomsForUser(request.user.sub)).map((r) => r.id);
    const all = getAllActiveCalls();
    const calls = accessibleRoomIds
      .filter((id) => all.has(id))
      .map((roomId) => ({ roomId, participants: all.get(roomId)! }));
    return { calls };
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
      const meta = await getRoomMeta(roomId);
      const messages = await listMessages(roomId, limit, before, meta?.cleared_at ?? null);

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

  fastify.post<{ Params: { id: string }; Body: { dataUrl: string; body?: string } }>(
    "/chat/rooms/:id/image",
    { onRequest: [fastify.authenticate], schema: { body: sendImageBodySchema } },
    async (request, reply) => {
      const roomId = Number(request.params.id);
      const allowed = await canAccessRoom(roomId, request.user.sub);
      if (!allowed) {
        return reply.code(403).send({ error: "Nincs hozzáférésed ehhez a szobához" });
      }
      const match = request.body.dataUrl.match(IMAGE_DATA_URL_PATTERN);
      if (!match) {
        return reply.code(400).send({ error: "Érvénytelen kép formátum" });
      }
      const [, mime, base64] = match;
      const data = Buffer.from(base64, "base64");
      const message = await insertMessage(roomId, request.user.sub, request.body.body?.trim() ?? "", {
        mime,
        data,
      });
      const recipientIds = await getRoomBroadcastUserIds(roomId);
      broadcastToUsers(recipientIds, { type: "message", message });
      return { message };
    }
  );

  fastify.get<{ Params: { id: string } }>(
    "/chat/messages/:id/image",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const messageId = Number(request.params.id);
      const roomId = await getMessageRoomId(messageId);
      if (!roomId || !(await canAccessRoom(roomId, request.user.sub))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed ehhez a képhez" });
      }
      const image = await getMessageImage(messageId);
      if (!image) {
        return reply.code(404).send();
      }
      reply.header("Content-Type", image.mime);
      reply.header("Cache-Control", "private, max-age=604800, immutable");
      return reply.send(image.data);
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

  fastify.post<{ Params: { id: string } }>(
    "/chat/rooms/:id/clear",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const roomId = Number(request.params.id);
      if (!(await canClearRoom(roomId, request.user.sub, request.user.role))) {
        return reply.code(403).send({ error: "Nincs jogosultságod törölni ezt a beszélgetést" });
      }
      await clearRoomHistory(roomId, request.user.sub);
      const recipientIds = await getRoomBroadcastUserIds(roomId);
      broadcastToUsers(recipientIds, { type: "room-cleared", roomId });
      return { ok: true };
    }
  );

  fastify.post<{ Params: { id: string } }>(
    "/chat/rooms/:id/restore",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const roomId = Number(request.params.id);
      if (!(await canClearRoom(roomId, request.user.sub, request.user.role))) {
        return reply.code(403).send({ error: "Nincs jogosultságod visszaállítani ezt a beszélgetést" });
      }
      await restoreRoomHistory(roomId);
      const recipientIds = await getRoomBroadcastUserIds(roomId);
      broadcastToUsers(recipientIds, { type: "room-restored", roomId });
      return { ok: true };
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

      if (CALL_RELAY_FRAME_TYPES.has(frame.type)) {
        if (!frame.roomId || !frame.targetUserId) return;
        const allowed = await canAccessRoom(frame.roomId, userId);
        if (!allowed) return;
        sendToUser(frame.targetUserId, { ...frame, fromUserId: userId });
        return;
      }

      if (frame.type === "call-join") {
        if (!frame.roomId) return;
        const allowed = await canAccessRoom(frame.roomId, userId);
        if (!allowed) return;
        const result = joinCall(frame.roomId, userId, socket);
        if (!result.ok) {
          sendToUser(userId, { type: "call-join-rejected", roomId: frame.roomId, reason: result.reason });
          return;
        }
        sendToUser(userId, { type: "call-joined", roomId: frame.roomId, participants: result.existing });
        await broadcastCallRoster(frame.roomId);
        return;
      }

      if (frame.type === "call-leave") {
        if (!frame.roomId) return;
        if (!leaveCall(frame.roomId, userId, socket)) return;
        await broadcastCallRoster(frame.roomId);
        return;
      }

      if (frame.type === "call-screen-share-state") {
        if (!frame.roomId || typeof frame.sharing !== "boolean") return;
        if (!setScreenSharing(frame.roomId, userId, frame.sharing)) return;
        await broadcastCallRoster(frame.roomId);
        return;
      }

      if (frame.type === "call-camera-state") {
        if (!frame.roomId || typeof frame.cameraOn !== "boolean") return;
        if (!setCameraState(frame.roomId, userId, frame.cameraOn)) return;
        await broadcastCallRoster(frame.roomId);
        return;
      }

      if (frame.type === "call-invite" || frame.type === "call-decline") {
        if (!frame.roomId) return;
        const allowed = await canAccessRoom(frame.roomId, userId);
        if (!allowed) return;
        // A célpontot mindig a szerver oldja fel (a DM másik tagja), nem a
        // kliens által küldött értékből — így senki nem tud csengetést
        // küldeni egy tetszőleges felhasználónak egy olyan szoba nevében,
        // aminek nem is tagja a célzott személy.
        const targetUserId = await getOtherDmMember(frame.roomId, userId);
        if (!targetUserId) return;
        const relayedType = frame.type === "call-invite" ? "call-invite" : "call-declined";
        sendToUser(targetUserId, { type: relayedType, roomId: frame.roomId, fromUserId: userId, fromName: frame.fromName });
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

      const affectedRoomIds = leaveAllCallsForSocket(socket);
      for (const roomId of affectedRoomIds) {
        void broadcastCallRoster(roomId);
      }
    });
  });
}
