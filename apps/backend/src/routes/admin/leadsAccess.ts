import type { FastifyInstance } from "fastify";
import { listLeadsAccessUserIds, setLeadsAccess } from "../../db/leads.js";

const accessBodySchema = {
  type: "object",
  required: ["userIds"],
  properties: {
    userIds: { type: "array", items: { type: "integer" } },
  },
} as const;

export default async function adminLeadsAccessRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", fastify.requireAdmin);

  fastify.get("/admin/leads-access", async () => {
    return { userIds: await listLeadsAccessUserIds() };
  });

  fastify.put<{ Body: { userIds: number[] } }>(
    "/admin/leads-access",
    { schema: { body: accessBodySchema } },
    async (request, reply) => {
      await setLeadsAccess(request.body.userIds, request.user.sub);
      return { ok: true };
    }
  );
}
