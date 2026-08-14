import type { FastifyInstance } from "fastify";
import { createRoom } from "../../db/chat.js";

const createRoomBodySchema = {
  type: "object",
  required: ["name", "memberIds"],
  properties: {
    name: { type: "string", minLength: 1 },
    memberIds: { type: "array", items: { type: "number" } },
  },
} as const;

export default async function adminChatRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", fastify.requireAdmin);

  fastify.post<{ Body: { name: string; memberIds: number[] } }>(
    "/admin/chat/rooms",
    { schema: { body: createRoomBodySchema } },
    async (request, reply) => {
      const room = await createRoom({
        name: request.body.name,
        memberIds: request.body.memberIds,
        createdBy: request.user.sub,
      });
      return reply.code(201).send({ room });
    }
  );
}
