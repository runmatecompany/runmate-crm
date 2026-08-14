import type { FastifyInstance } from "fastify";
import {
  createLead,
  deleteLead,
  getLeadById,
  hasLeadsAccess,
  listAllLeads,
  updateLeadDetails,
  updateLeadStatus,
  type LeadStatus,
} from "../db/leads.js";

const LEAD_STATUS_VALUES = ["to_call", "called", "call_back", "became_customer", "not_interested"] as const;

const leadDetailsSchema = {
  companyName: { type: "string", minLength: 1 },
  contactName: { type: "string" },
  phone: { type: "string" },
  email: { type: "string" },
  address: { type: "string" },
  notes: { type: "string" },
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

interface LeadDetailsBody {
  companyName: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
}

// Modul-szintű hozzáférés: admin mindig, más csak akkor, ha az admin
// felvette a leads_access listára.
async function canAccessLeadsModule(userId: number, role: "admin" | "user"): Promise<boolean> {
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
