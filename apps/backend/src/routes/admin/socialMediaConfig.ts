import type { FastifyInstance } from "fastify";
import { getSenderAccountId, setSenderAccountId } from "../../db/socialMediaConfig.js";

const configBodySchema = {
  type: "object",
  required: ["senderAccountId"],
  properties: {
    senderAccountId: { type: ["integer", "null"] },
  },
} as const;

export default async function adminSocialMediaConfigRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", fastify.requireAdmin);

  fastify.get("/admin/social-media/config", async () => {
    return { senderAccountId: await getSenderAccountId() };
  });

  fastify.put<{ Body: { senderAccountId: number | null } }>(
    "/admin/social-media/config",
    { schema: { body: configBodySchema } },
    async (request, reply) => {
      await setSenderAccountId(request.body.senderAccountId);
      return reply.send({ ok: true });
    }
  );
}
