import type { FastifyInstance } from "fastify";
import { grantLeadsAccess, hasLeadsAccess, revokeLeadsAccess } from "../../db/leads.js";
import {
  grantAccountAccess,
  listAccessibleAccountIdsForUser,
  listAccountsAdmin,
  revokeAccountAccess,
} from "../../db/emailAccounts.js";

const accessBodySchema = {
  type: "object",
  required: ["leadsAccess", "emailAccountIds"],
  properties: {
    leadsAccess: { type: "boolean" },
    emailAccountIds: { type: "array", items: { type: "integer" } },
  },
} as const;

// Egységes, felhasználó-központú jogosultság-kezelés: egy adott user melyik
// modulokhoz (Leadek, email fiókok) fér hozzá. A Beállítások > Profilok
// oldal ezen keresztül állítja be egyszerre az összes hozzáférést.
export default async function adminUserAccessRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", fastify.requireAdmin);

  fastify.get<{ Params: { id: string } }>("/admin/users/:id/access", async (request) => {
    const userId = Number(request.params.id);
    const [leadsAccess, emailAccountIds] = await Promise.all([
      hasLeadsAccess(userId),
      listAccessibleAccountIdsForUser(userId),
    ]);
    return { leadsAccess, emailAccountIds };
  });

  fastify.put<{ Params: { id: string }; Body: { leadsAccess: boolean; emailAccountIds: number[] } }>(
    "/admin/users/:id/access",
    { schema: { body: accessBodySchema } },
    async (request, reply) => {
      const userId = Number(request.params.id);
      const { leadsAccess, emailAccountIds } = request.body;

      if (leadsAccess) {
        await grantLeadsAccess(userId, request.user.sub);
      } else {
        await revokeLeadsAccess(userId);
      }

      const wanted = new Set(emailAccountIds);
      const allAccounts = await listAccountsAdmin();
      await Promise.all(
        allAccounts.map((account) =>
          wanted.has(account.id)
            ? grantAccountAccess(account.id, userId, request.user.sub)
            : revokeAccountAccess(account.id, userId)
        )
      );

      return reply.send({ ok: true });
    }
  );
}
