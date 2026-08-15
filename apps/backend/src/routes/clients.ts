import type { FastifyInstance } from "fastify";
import {
  createClient,
  deleteClient,
  getClientById,
  hasClientsAccess,
  listAllClients,
  updateClientDetails,
} from "../db/clients.js";

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
      return reply.code(201).send({ client });
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
}
