import type { FastifyInstance } from "fastify";
import {
  convertLeadToClient,
  createLead,
  deleteLead,
  getLeadById,
  hasLeadsAccess,
  listAllLeads,
  updateLeadDetails,
  updateLeadStatus,
  type LeadStatus,
} from "../db/leads.js";
import { extractLeadFromImages, isLeadExtractionEnabled, type LeadImageInput } from "../lib/leadExtraction.js";
import { canAccessClientsModule } from "./clients.js";
import { getClientById } from "../db/clients.js";
import { provisionClientDriveFolders } from "../lib/googleDrive/onboarding.js";

const LEAD_STATUS_VALUES = ["to_call", "called", "call_back", "became_customer", "not_interested"] as const;

const leadDetailsSchema = {
  companyName: { type: "string", minLength: 1 },
  contactName: { type: "string" },
  phone: { type: "string" },
  email: { type: "string" },
  address: { type: "string" },
  notes: { type: "string" },
  websiteUrl: { type: "string" },
};

const createLeadBodySchema = {
  type: "object",
  required: ["companyName"],
  properties: leadDetailsSchema,
} as const;

const updateLeadBodySchema = {
  type: "object",
  required: ["companyName"],
  properties: leadDetailsSchema,
} as const;

const statusBodySchema = {
  type: "object",
  required: ["status"],
  properties: { status: { type: "string", enum: [...LEAD_STATUS_VALUES] } },
} as const;

const DATA_URL_PATTERN = /^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,(.+)$/;

const extractBodySchema = {
  type: "object",
  required: ["images"],
  properties: {
    images: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      // ~8 MB base64 kép (kb. 6 MB nyers) — bőven elég egy telefonos fotóhoz.
      items: { type: "string", maxLength: 8_000_000 },
    },
  },
} as const;

interface LeadDetailsBody {
  companyName: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  websiteUrl?: string;
}

// Modul-szintű hozzáférés: admin mindig, más csak akkor, ha az admin
// felvette a leads_access listára. Exportálva, mert a routes/leadResearch.ts
// is ugyanezt a hozzáférés-ellenőrzést használja.
export async function canAccessLeadsModule(userId: number, role: "admin" | "user"): Promise<boolean> {
  return role === "admin" || (await hasLeadsAccess(userId));
}

export default async function leadsRoutes(fastify: FastifyInstance) {
  fastify.get("/leads", { onRequest: [fastify.authenticate] }, async (request) => {
    const access = await canAccessLeadsModule(request.user.sub, request.user.role);
    return { leads: access ? await listAllLeads() : [], hasAccess: access };
  });

  fastify.get<{ Params: { id: string } }>("/leads/:id", { onRequest: [fastify.authenticate] }, async (
    request,
    reply
  ) => {
    if (!(await canAccessLeadsModule(request.user.sub, request.user.role))) {
      return reply.code(403).send({ error: "Nincs hozzáférésed a Leadek modulhoz" });
    }
    const lead = await getLeadById(Number(request.params.id));
    if (!lead) return reply.code(404).send({ error: "Lead not found" });
    return { lead };
  });

  fastify.post<{ Body: LeadDetailsBody }>(
    "/leads",
    { onRequest: [fastify.authenticate], schema: { body: createLeadBodySchema } },
    async (request, reply) => {
      if (!(await canAccessLeadsModule(request.user.sub, request.user.role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed a Leadek modulhoz" });
      }
      const lead = await createLead({ ...request.body, createdBy: request.user.sub });
      return reply.code(201).send({ lead });
    }
  );

  fastify.post<{ Body: { images: string[] } }>(
    "/leads/extract-from-images",
    { onRequest: [fastify.authenticate], schema: { body: extractBodySchema } },
    async (request, reply) => {
      if (!(await canAccessLeadsModule(request.user.sub, request.user.role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed a Leadek modulhoz" });
      }
      if (!isLeadExtractionEnabled()) {
        return reply.code(503).send({ error: "Az AI kitöltés nincs beállítva a szerveren" });
      }

      const images: LeadImageInput[] = [];
      for (const dataUrl of request.body.images) {
        const match = dataUrl.match(DATA_URL_PATTERN);
        if (!match) {
          return reply.code(400).send({ error: "Érvénytelen kép formátum" });
        }
        const [, mime, base64] = match;
        images.push({ mediaType: (mime === "image/jpg" ? "image/jpeg" : mime) as LeadImageInput["mediaType"], base64 });
      }

      try {
        const fields = await extractLeadFromImages(images);
        return { fields };
      } catch (err) {
        fastify.log.error(err, "Lead extraction failed");
        return reply.code(502).send({ error: err instanceof Error ? err.message : "Nem sikerült feldolgozni a képeket" });
      }
    }
  );

  fastify.put<{ Params: { id: string }; Body: LeadDetailsBody }>(
    "/leads/:id",
    { onRequest: [fastify.authenticate], schema: { body: updateLeadBodySchema } },
    async (request, reply) => {
      if (!(await canAccessLeadsModule(request.user.sub, request.user.role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed a Leadek modulhoz" });
      }
      const existing = await getLeadById(Number(request.params.id));
      if (!existing) return reply.code(404).send({ error: "Lead not found" });
      const lead = await updateLeadDetails(existing.id, request.body);
      return { lead };
    }
  );

  fastify.patch<{ Params: { id: string }; Body: { status: LeadStatus } }>(
    "/leads/:id/status",
    { onRequest: [fastify.authenticate], schema: { body: statusBodySchema } },
    async (request, reply) => {
      if (!(await canAccessLeadsModule(request.user.sub, request.user.role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed a Leadek modulhoz" });
      }
      const existing = await getLeadById(Number(request.params.id));
      if (!existing) return reply.code(404).send({ error: "Lead not found" });
      const lead = await updateLeadStatus(existing.id, request.body.status);
      return { lead };
    }
  );

  // Egy megszerzett lead ügyféllé alakítása: became_customer-re állítja a
  // leadet, és létrehozza a kapcsolódó Ügyfelek-sort — mindkét modulhoz kell
  // hozzáférés, hiszen mindkét modul adatát módosítja.
  fastify.post<{ Params: { id: string } }>(
    "/leads/:id/convert-to-client",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { sub: userId, role } = request.user;
      if (!(await canAccessLeadsModule(userId, role)) || !(await canAccessClientsModule(userId, role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed a Leadek és az Ügyfelek modulhoz" });
      }
      const leadId = Number(request.params.id);
      const existing = await getLeadById(leadId);
      if (!existing) return reply.code(404).send({ error: "Lead not found" });
      const clientId = await convertLeadToClient(leadId, userId);

      // Onboarding: Drive-mappastruktúra automatikus létrehozása, ugyanaz a
      // best-effort minta, mint a kézi ügyfél-létrehozásnál (routes/clients.ts).
      const newClient = await getClientById(clientId);
      if (newClient) {
        try {
          await provisionClientDriveFolders(newClient);
        } catch (err) {
          fastify.log.error(err, "Drive folder onboarding failed for converted client");
        }
      }

      return reply.code(201).send({ clientId });
    }
  );

  fastify.delete<{ Params: { id: string } }>("/leads/:id", { onRequest: [fastify.authenticate] }, async (
    request,
    reply
  ) => {
    if (request.user.role !== "admin") {
      return reply.code(403).send({ error: "Csak admin törölhet leadet" });
    }
    const deleted = await deleteLead(Number(request.params.id));
    if (!deleted) return reply.code(404).send({ error: "Lead not found" });
    return { ok: true };
  });
}
