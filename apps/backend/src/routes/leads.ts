import type { FastifyInstance } from "fastify";
import {
  convertLeadToClient,
  createLead,
  deleteLead,
  DuplicateClientError,
  getLeadById,
  hasLeadsAccess,
  listAllLeads,
  updateLeadDetails,
  updateLeadStatus,
  type LeadStatus,
} from "../db/leads.js";
import {
  extractLeadFromMedia,
  isLeadExtractionEnabled,
  type LeadDocumentInput,
  type LeadImageInput,
} from "../lib/leadExtraction.js";
import { canAccessClientsModule } from "./clients.js";
import { getClientById } from "../db/clients.js";
import { provisionClientDriveFolders } from "../lib/googleDrive/onboarding.js";

const LEAD_STATUS_VALUES = ["to_call", "call_back", "interested", "became_customer", "not_interested"] as const;

const leadDetailsSchema = {
  companyName: { type: "string", minLength: 1 },
  contactName: { type: "string" },
  phone: { type: "string" },
  email: { type: "string" },
  address: { type: "string" },
  city: { type: "string" },
  notes: { type: "string" },
  websiteUrl: { type: "string" },
  facebookUrl: { type: "string" },
  instagramUrl: { type: "string" },
  tiktokUrl: { type: "string" },
  youtubeUrl: { type: "string" },
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
  properties: {
    status: { type: "string", enum: [...LEAD_STATUS_VALUES] },
    note: { type: "string" },
  },
} as const;

const DATA_URL_PATTERN = /^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,(.+)$/;

const extractBodySchema = {
  type: "object",
  properties: {
    images: {
      type: "array",
      maxItems: 5,
      // ~8 MB base64 kép (kb. 6 MB nyers) — bőven elég egy telefonos fotóhoz.
      items: { type: "string", maxLength: 8_000_000 },
    },
    // A frontend Excel-fájlokat is kliens-oldalon (lib/xlsxToCsv.ts)
    // alakítja át szöveggé, mielőtt ide küldi — a szervernek nem kell
    // tudnia semmit a bináris Excel-formátumról.
    documents: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        required: ["filename", "text"],
        properties: {
          filename: { type: "string", maxLength: 200 },
          text: { type: "string", maxLength: 500_000 },
        },
      },
    },
  },
} as const;

interface LeadDetailsBody {
  companyName: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  notes?: string;
  websiteUrl?: string;
  facebookUrl?: string;
  instagramUrl?: string;
  tiktokUrl?: string;
  youtubeUrl?: string;
}

// Modul-szintű hozzáférés: admin mindig, más csak akkor, ha az admin
// felvette a leads_access listára.
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

  fastify.post<{ Body: { images?: string[]; documents?: LeadDocumentInput[] } }>(
    "/leads/extract",
    { onRequest: [fastify.authenticate], schema: { body: extractBodySchema } },
    async (request, reply) => {
      if (!(await canAccessLeadsModule(request.user.sub, request.user.role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed a Leadek modulhoz" });
      }
      if (!isLeadExtractionEnabled()) {
        return reply.code(503).send({ error: "Az AI kitöltés nincs beállítva a szerveren" });
      }

      const rawImages = request.body.images ?? [];
      const documents = request.body.documents ?? [];
      if (rawImages.length === 0 && documents.length === 0) {
        return reply.code(400).send({ error: "Nincs feltöltött kép vagy dokumentum" });
      }

      const images: LeadImageInput[] = [];
      for (const dataUrl of rawImages) {
        const match = dataUrl.match(DATA_URL_PATTERN);
        if (!match) {
          return reply.code(400).send({ error: "Érvénytelen kép formátum" });
        }
        const [, mime, base64] = match;
        images.push({ mediaType: (mime === "image/jpg" ? "image/jpeg" : mime) as LeadImageInput["mediaType"], base64 });
      }

      try {
        const fields = await extractLeadFromMedia(images, documents);
        return { fields };
      } catch (err) {
        fastify.log.error(err, "Lead extraction failed");
        return reply.code(502).send({ error: err instanceof Error ? err.message : "Nem sikerült feldolgozni a fájlokat" });
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

  fastify.patch<{ Params: { id: string }; Body: { status: LeadStatus; note?: string } }>(
    "/leads/:id/status",
    { onRequest: [fastify.authenticate], schema: { body: statusBodySchema } },
    async (request, reply) => {
      if (!(await canAccessLeadsModule(request.user.sub, request.user.role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed a Leadek modulhoz" });
      }
      if (request.body.status === "interested" && !request.body.note?.trim()) {
        return reply.code(400).send({ error: "Az 'Érdekli' állapothoz kötelező jegyzetet megadni" });
      }
      const existing = await getLeadById(Number(request.params.id));
      if (!existing) return reply.code(404).send({ error: "Lead not found" });
      const lead = await updateLeadStatus(existing.id, request.body.status, request.body.note?.trim());
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
      let clientId: number;
      try {
        clientId = await convertLeadToClient(leadId, userId);
      } catch (err) {
        if (err instanceof DuplicateClientError) {
          return reply.code(409).send({ error: err.message });
        }
        throw err;
      }

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
