import type { FastifyInstance } from "fastify";
import {
  createSupportTicket,
  hasSupportAccess,
  listSupportTickets,
  updateSupportTicketStatus,
  type SupportTicketStatus,
} from "../db/supportTickets.js";

export async function canAccessSupportModule(userId: number, role: "admin" | "user"): Promise<boolean> {
  return role === "admin" || (await hasSupportAccess(userId));
}

const SUPPORT_STATUS_VALUES = ["open", "resolved"] as const;

const createTicketBodySchema = {
  type: "object",
  required: ["body"],
  properties: {
    body: { type: "string", minLength: 1, maxLength: 5000 },
  },
} as const;

const statusBodySchema = {
  type: "object",
  required: ["status"],
  properties: {
    status: { type: "string", enum: [...SUPPORT_STATUS_VALUES] },
  },
} as const;

// A jelzés beküldése bárkinek elérhető (nem modul-jogosultsághoz kötött,
// mint a Kijelentkezés gomb) — a lista MEGTEKINTÉSE viszont igen, hogy ne
// mindenki lássa mindenki más bug-jelentését/kérését alapból.
export default async function supportRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: { body: string } }>(
    "/support/tickets",
    { onRequest: [fastify.authenticate], schema: { body: createTicketBodySchema } },
    async (request, reply) => {
      const ticket = await createSupportTicket(request.body.body.trim(), request.user.sub);
      return reply.code(201).send({ ticket });
    }
  );

  fastify.get("/support/tickets", { onRequest: [fastify.authenticate] }, async (request) => {
    const { sub: userId, role } = request.user;
    if (!(await canAccessSupportModule(userId, role))) {
      return { tickets: [], hasAccess: false };
    }
    const tickets = await listSupportTickets();
    return { tickets, hasAccess: true };
  });

  fastify.patch<{ Params: { id: string }; Body: { status: SupportTicketStatus } }>(
    "/support/tickets/:id/status",
    { onRequest: [fastify.authenticate], schema: { body: statusBodySchema } },
    async (request, reply) => {
      const { sub: userId, role } = request.user;
      if (!(await canAccessSupportModule(userId, role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed a Support modulhoz" });
      }
      const ticket = await updateSupportTicketStatus(Number(request.params.id), request.body.status, userId);
      if (!ticket) return reply.code(404).send({ error: "Bejegyzés nem található" });
      return { ticket };
    }
  );
}
