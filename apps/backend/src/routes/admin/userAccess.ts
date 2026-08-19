import type { FastifyInstance } from "fastify";
import { grantLeadsAccess, hasLeadsAccess, revokeLeadsAccess } from "../../db/leads.js";
import { grantClientsAccess, hasClientsAccess, revokeClientsAccess } from "../../db/clients.js";
import { grantSocialMediaAccess, hasSocialMediaAccess, revokeSocialMediaAccess } from "../../db/contentItems.js";
import { revokeAllDriveFolderGrants } from "../../lib/clipping.js";
import { grantTasksAccess, hasTasksAccess, revokeTasksAccess } from "../../db/tasks.js";
import { grantLeadGenAccess, hasLeadGenAccess, revokeLeadGenAccess } from "../../db/leadgenAccess.js";
import { grantWebAccess, hasWebAccess, revokeWebAccess } from "../../db/webProjects.js";
import {
  grantAccountAccess,
  grantEmailModuleAccess,
  hasEmailModuleAccess,
  listAccessibleAccountIdsForUser,
  listAccountsAdmin,
  revokeAccountAccess,
  revokeEmailModuleAccess,
} from "../../db/emailAccounts.js";

const accessBodySchema = {
  type: "object",
  required: [
    "leadsAccess", "clientsAccess", "socialMediaAccess", "tasksAccess", "leadGenAccess", "webAccess",
    "emailModuleAccess", "emailAccountIds",
  ],
  properties: {
    leadsAccess: { type: "boolean" },
    clientsAccess: { type: "boolean" },
    socialMediaAccess: { type: "boolean" },
    tasksAccess: { type: "boolean" },
    leadGenAccess: { type: "boolean" },
    webAccess: { type: "boolean" },
    emailModuleAccess: { type: "boolean" },
    emailAccountIds: { type: "array", items: { type: "integer" } },
  },
} as const;

// Egységes, felhasználó-központú jogosultság-kezelés: egy adott user melyik
// modulokhoz (Leadek, Email) fér hozzá, illetve — ha a modulnak több eleme
// van (email fiókok) — melyikeket látja azok közül. A Beállítások > Profilok
// oldal ezen keresztül állítja be egyszerre az összes hozzáférést.
export default async function adminUserAccessRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", fastify.requireAdmin);

  fastify.get<{ Params: { id: string } }>("/admin/users/:id/access", async (request) => {
    const userId = Number(request.params.id);
    const [leadsAccess, clientsAccess, socialMediaAccess, tasksAccess, leadGenAccess, webAccess, emailModuleAccess, emailAccountIds] =
      await Promise.all([
        hasLeadsAccess(userId),
        hasClientsAccess(userId),
        hasSocialMediaAccess(userId),
        hasTasksAccess(userId),
        hasLeadGenAccess(userId),
        hasWebAccess(userId),
        hasEmailModuleAccess(userId),
        listAccessibleAccountIdsForUser(userId),
      ]);
    return { leadsAccess, clientsAccess, socialMediaAccess, tasksAccess, leadGenAccess, webAccess, emailModuleAccess, emailAccountIds };
  });

  fastify.put<{
    Params: { id: string };
    Body: {
      leadsAccess: boolean;
      clientsAccess: boolean;
      socialMediaAccess: boolean;
      tasksAccess: boolean;
      leadGenAccess: boolean;
      webAccess: boolean;
      emailModuleAccess: boolean;
      emailAccountIds: number[];
    };
  }>("/admin/users/:id/access", { schema: { body: accessBodySchema } }, async (request, reply) => {
    const userId = Number(request.params.id);
    const { leadsAccess, clientsAccess, socialMediaAccess, tasksAccess, leadGenAccess, webAccess, emailModuleAccess, emailAccountIds } =
      request.body;

    if (leadsAccess) {
      await grantLeadsAccess(userId, request.user.sub);
    } else {
      await revokeLeadsAccess(userId);
    }

    if (clientsAccess) {
      await grantClientsAccess(userId, request.user.sub);
    } else {
      await revokeClientsAccess(userId);
    }

    if (socialMediaAccess) {
      await grantSocialMediaAccess(userId, request.user.sub);
    } else {
      await revokeSocialMediaAccess(userId);
    }

    // A klip-feltöltéshez a Content Kanbanban Ügyfelek VAGY Social Media
    // hozzáférés is elég — csak akkor vonjuk vissza a korábban a saját
    // Google-fiókjának adott Drive-mappa jogokat, ha EGYIK sem maradt meg
    // (különben jogosan feltölthetne még, feleslegesen szednénk el a jogát).
    if (!clientsAccess && !socialMediaAccess) {
      await revokeAllDriveFolderGrants(userId);
    }

    if (tasksAccess) {
      await grantTasksAccess(userId, request.user.sub);
    } else {
      await revokeTasksAccess(userId);
    }

    if (leadGenAccess) {
      await grantLeadGenAccess(userId, request.user.sub);
    } else {
      await revokeLeadGenAccess(userId);
    }

    if (webAccess) {
      await grantWebAccess(userId, request.user.sub);
    } else {
      await revokeWebAccess(userId);
    }

    if (emailModuleAccess) {
      await grantEmailModuleAccess(userId, request.user.sub);
    } else {
      await revokeEmailModuleAccess(userId);
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
  });
}
