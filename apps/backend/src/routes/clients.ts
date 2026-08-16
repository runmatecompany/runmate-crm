import type { FastifyInstance } from "fastify";
import {
  createClient,
  deleteClient,
  getClientById,
  hasClientsAccess,
  listAllClients,
  updateClientDetails,
} from "../db/clients.js";
import { getClientAiProfile, upsertClientAiProfile } from "../db/clientAiProfiles.js";
import { hasSocialMediaAccess } from "../db/contentItems.js";
import { provisionClientDriveFolders } from "../lib/googleDrive/onboarding.js";

const clientDetailsSchema = {
  companyName: { type: "string", minLength: 1 },
  contactName: { type: "string" },
  phone: { type: "string" },
  email: { type: "string" },
  address: { type: "string" },
  notes: { type: "string" },
};

const createClientBodySchema = {
  type: "object",
  required: ["companyName"],
  properties: clientDetailsSchema,
} as const;

const updateClientBodySchema = {
  type: "object",
  required: ["companyName"],
  properties: clientDetailsSchema,
} as const;

interface ClientDetailsBody {
  companyName: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
}

const aiProfileBodySchema = {
  type: "object",
  properties: {
    brandVoice: { type: "string" },
    targetAudience: { type: "string" },
    visualDirection: { type: "string" },
    forbiddenTopics: { type: "string" },
    ctaStyle: { type: "string" },
    platformNotes: { type: "string" },
    referenceLinks: { type: "string" },
    hasSocialPresence: { type: "boolean" },
    inspirationBrands: { type: "string" },
    brandMission: { type: "string" },
    contentGoals: { type: "string" },
    publishingCadence: { type: "string" },
    approvalProcessNotes: { type: "string" },
  },
} as const;

interface AiProfileBody {
  brandVoice?: string;
  targetAudience?: string;
  visualDirection?: string;
  forbiddenTopics?: string;
  ctaStyle?: string;
  platformNotes?: string;
  referenceLinks?: string;
  hasSocialPresence?: boolean;
  inspirationBrands?: string;
  brandMission?: string;
  contentGoals?: string;
  publishingCadence?: string;
  approvalProcessNotes?: string;
}

// Modul-szintű hozzáférés: admin mindig, más csak akkor, ha az admin
// felvette a clients_access listára.
export async function canAccessClientsModule(userId: number, role: "admin" | "user"): Promise<boolean> {
  return role === "admin" || (await hasClientsAccess(userId));
}

export default async function clientsRoutes(fastify: FastifyInstance) {
  fastify.get("/clients", { onRequest: [fastify.authenticate] }, async (request) => {
    const access = await canAccessClientsModule(request.user.sub, request.user.role);
    return { clients: access ? await listAllClients() : [], hasAccess: access };
  });

  fastify.get<{ Params: { id: string } }>("/clients/:id", { onRequest: [fastify.authenticate] }, async (
    request,
    reply
  ) => {
    if (!(await canAccessClientsModule(request.user.sub, request.user.role))) {
      return reply.code(403).send({ error: "Nincs hozzáférésed az Ügyfelek modulhoz" });
    }
    const client = await getClientById(Number(request.params.id));
    if (!client) return reply.code(404).send({ error: "Client not found" });
    return { client };
  });

  fastify.post<{ Body: ClientDetailsBody }>(
    "/clients",
    { onRequest: [fastify.authenticate], schema: { body: createClientBodySchema } },
    async (request, reply) => {
      if (!(await canAccessClientsModule(request.user.sub, request.user.role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed az Ügyfelek modulhoz" });
      }
      const client = await createClient({ ...request.body, createdBy: request.user.sub });

      // Onboarding: Drive-mappastruktúra automatikus létrehozása. Best-effort
      // — ha nincs Google-kapcsolat vagy hibázik, az ügyfél-létrehozás akkor
      // is sikeres marad, csak logoljuk.
      try {
        await provisionClientDriveFolders(client);
      } catch (err) {
        fastify.log.error(err, "Drive folder onboarding failed for new client");
      }

      return reply.code(201).send({ client: (await getClientById(client.id))! });
    }
  );

  fastify.put<{ Params: { id: string }; Body: ClientDetailsBody }>(
    "/clients/:id",
    { onRequest: [fastify.authenticate], schema: { body: updateClientBodySchema } },
    async (request, reply) => {
      if (!(await canAccessClientsModule(request.user.sub, request.user.role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed az Ügyfelek modulhoz" });
      }
      const existing = await getClientById(Number(request.params.id));
      if (!existing) return reply.code(404).send({ error: "Client not found" });
      const client = await updateClientDetails(existing.id, request.body);
      return { client };
    }
  );

  fastify.delete<{ Params: { id: string } }>("/clients/:id", { onRequest: [fastify.authenticate] }, async (
    request,
    reply
  ) => {
    if (request.user.role !== "admin") {
      return reply.code(403).send({ error: "Csak admin törölhet ügyfelet" });
    }
    const deleted = await deleteClient(Number(request.params.id));
    if (!deleted) return reply.code(404).send({ error: "Client not found" });
    return { ok: true };
  });

  // Az AI-profilt az Ügyfelek modul VAGY a Social Media modul hozzáférésével
  // rendelkezők olvashatják (a script-írás nézet emlékeztető panelje is ezt
  // hívja) — a szerkesztés (PUT) viszont márka-kritikus adat, admin-only.
  fastify.get<{ Params: { id: string } }>(
    "/clients/:id/ai-profile",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { sub: userId, role } = request.user;
      const access =
        role === "admin" || (await hasClientsAccess(userId)) || (await hasSocialMediaAccess(userId));
      if (!access) {
        return reply.code(403).send({ error: "Nincs hozzáférésed ehhez" });
      }
      const clientId = Number(request.params.id);
      if (!(await getClientById(clientId))) return reply.code(404).send({ error: "Client not found" });
      const profile = (await getClientAiProfile(clientId)) ?? null;
      return { profile };
    }
  );

  fastify.put<{ Params: { id: string }; Body: AiProfileBody }>(
    "/clients/:id/ai-profile",
    { onRequest: [fastify.authenticate], schema: { body: aiProfileBodySchema } },
    async (request, reply) => {
      if (request.user.role !== "admin") {
        return reply.code(403).send({ error: "Csak admin szerkesztheti az AI-profilt" });
      }
      const clientId = Number(request.params.id);
      if (!(await getClientById(clientId))) return reply.code(404).send({ error: "Client not found" });
      const profile = await upsertClientAiProfile(clientId, request.body);
      return { profile };
    }
  );
}
