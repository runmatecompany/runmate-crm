import type { FastifyInstance } from "fastify";
import {
  createLead,
  deleteLead,
  getLeadById,
  listAllLeads,
  listAssignedLeads,
  reassignLead,
  updateLeadDetails,
  updateLeadStatus,
  type LeadRow,
  type LeadStatus,
} from "../db/leads.js";

const LEAD_STATUS_VALUES = ["to_call", "called", "call_back", "became_customer", "not_interested"] as const;

const createLeadBodySchema = {
  type: "object",
  required: ["companyName"],
  properties: {
    companyName: { type: "string", minLength: 1 },
    contactName: { type: "string" },
    phone: { type: "string" },
    email: { type: "string" },
    address: { type: "string" },
    notes: { type: "string" },
    assignedTo: { type: ["integer", "null"] },
  },
} as const;

const updateLeadBodySchema = {
  type: "object",
  required: ["companyName"],
  properties: {
    companyName: { type: "string", minLength: 1 },
    contactName: { type: "string" },
    phone: { type: "string" },
    email: { type: "string" },
    address: { type: "string" },
    notes: { type: "string" },
  },
} as const;

const statusBodySchema = {
  type: "object",
  required: ["status"],
  properties: { status: { type: "string", enum: [...LEAD_STATUS_VALUES] } },
} as const;

const assignBodySchema = {
  type: "object",
  required: ["assignedTo"],
  properties: { assignedTo: { type: ["integer", "null"] } },
} as const;

interface LeadDetailsBody {
  companyName: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
}

function canAccessLead(lead: LeadRow, userId: number, role: "admin" | "user"): boolean {
  return role === "admin" || lead.assigned_to === userId;
}

export default async function leadsRoutes(fastify: FastifyInstance) {
  fastify.get("/leads", { onRequest: [fastify.authenticate] }, async (request) => {
    const leads =
      request.user.role === "admin" ? await listAllLeads() : await listAssignedLeads(request.user.sub);
    return { leads };
  });

  fastify.get<{ Params: { id: string } }>("/leads/:id", { onRequest: [fastify.authenticate] }, async (
    request,
    reply
  ) => {
    const lead = await getLeadById(Number(request.params.id));
    if (!lead) return reply.code(404).send({ error: "Lead not found" });
    if (!canAccessLead(lead, request.user.sub, request.user.role)) {
      return reply.code(403).send({ error: "Nincs hozzáférésed ehhez a leadhez" });
    }
    return { lead };
  });

  fastify.post<{ Body: LeadDetailsBody & { assignedTo?: number | null } }>(
    "/leads",
    { onRequest: [fastify.authenticate], schema: { body: createLeadBodySchema } },
    async (request, reply) => {
      const b = request.body;
      // Nem admin csak saját magának hozhat létre leadet, hogy amit létrehoz,
      // azt utána garantáltan lássa is.
      const assignedTo = request.user.role === "admin" ? (b.assignedTo ?? null) : request.user.sub;
      const lead = await createLead({ ...b, assignedTo, createdBy: request.user.sub });
      return reply.code(201).send({ lead });
    }
  );

  fastify.put<{ Params: { id: string }; Body: LeadDetailsBody }>(
    "/leads/:id",
    { onRequest: [fastify.authenticate], schema: { body: updateLeadBodySchema } },
    async (request, reply) => {
      const existing = await getLeadById(Number(request.params.id));
      if (!existing) return reply.code(404).send({ error: "Lead not found" });
      if (!canAccessLead(existing, request.user.sub, request.user.role)) {
        return reply.code(403).send({ error: "Nincs hozzáférésed ehhez a leadhez" });
      }
      const lead = await updateLeadDetails(existing.id, request.body);
      return { lead };
    }
  );

  fastify.patch<{ Params: { id: string }; Body: { status: LeadStatus } }>(
    "/leads/:id/status",
    { onRequest: [fastify.authenticate], schema: { body: statusBodySchema } },
    async (request, reply) => {
      const existing = await getLeadById(Number(request.params.id));
      if (!existing) return reply.code(404).send({ error: "Lead not found" });
      if (!canAccessLead(existing, request.user.sub, request.user.role)) {
        return reply.code(403).send({ error: "Nincs hozzáférésed ehhez a leadhez" });
      }
      const lead = await updateLeadStatus(existing.id, request.body.status);
      return { lead };
    }
  );

  fastify.patch<{ Params: { id: string }; Body: { assignedTo: number | null } }>(
    "/leads/:id/assign",
    { onRequest: [fastify.authenticate], schema: { body: assignBodySchema } },
    async (request, reply) => {
      if (request.user.role !== "admin") {
        return reply.code(403).send({ error: "Csak admin rendelhet át leadet" });
      }
      const existing = await getLeadById(Number(request.params.id));
      if (!existing) return reply.code(404).send({ error: "Lead not found" });
      const lead = await reassignLead(existing.id, request.body.assignedTo);
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
