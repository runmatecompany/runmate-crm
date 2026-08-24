import type { FastifyInstance } from "fastify";
import { createInvoice, deleteInvoice, getInvoiceById, listInvoices, setInvoiceStatus, updateInvoice, type InvoiceInput, type InvoiceStatus } from "../db/invoices.js";

const invoiceBodySchema = {
  type: "object",
  required: ["clientId", "description", "amount", "issueDate"],
  properties: {
    clientId: { type: "number" },
    description: { type: "string", minLength: 1 },
    amount: { type: "string", minLength: 1 },
    invoiceNumber: { type: "string" },
    issueDate: { type: "string" },
    dueDate: { type: "string" },
    driveLink: { type: "string" },
    notes: { type: "string" },
  },
} as const;

const statusBodySchema = {
  type: "object",
  required: ["status"],
  properties: {
    status: { type: "string", enum: ["unpaid", "paid"] },
  },
} as const;

// Belső számla-nyilvántartó — pénzügyi adat, ezért admin-only, nincs
// egyénileg kiosztható <module>_access, ugyanúgy közvetlen role-ellenőrzés,
// mint a lead-törlésnél.
export default async function billingRoutes(fastify: FastifyInstance) {
  fastify.get("/invoices", { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== "admin") {
      return reply.code(403).send({ error: "Csak admin férhet hozzá a Számlázás modulhoz" });
    }
    return { invoices: await listInvoices() };
  });

  fastify.post<{ Body: InvoiceInput }>(
    "/invoices",
    { onRequest: [fastify.authenticate], schema: { body: invoiceBodySchema } },
    async (request, reply) => {
      if (request.user.role !== "admin") {
        return reply.code(403).send({ error: "Csak admin férhet hozzá a Számlázás modulhoz" });
      }
      const invoice = await createInvoice(request.body, request.user.sub);
      return reply.code(201).send({ invoice });
    }
  );

  fastify.put<{ Params: { id: string }; Body: InvoiceInput }>(
    "/invoices/:id",
    { onRequest: [fastify.authenticate], schema: { body: invoiceBodySchema } },
    async (request, reply) => {
      if (request.user.role !== "admin") {
        return reply.code(403).send({ error: "Csak admin férhet hozzá a Számlázás modulhoz" });
      }
      const existing = await getInvoiceById(Number(request.params.id));
      if (!existing) return reply.code(404).send({ error: "Invoice not found" });
      const invoice = await updateInvoice(existing.id, request.body);
      return { invoice };
    }
  );

  fastify.patch<{ Params: { id: string }; Body: { status: InvoiceStatus } }>(
    "/invoices/:id/status",
    { onRequest: [fastify.authenticate], schema: { body: statusBodySchema } },
    async (request, reply) => {
      if (request.user.role !== "admin") {
        return reply.code(403).send({ error: "Csak admin férhet hozzá a Számlázás modulhoz" });
      }
      const existing = await getInvoiceById(Number(request.params.id));
      if (!existing) return reply.code(404).send({ error: "Invoice not found" });
      const invoice = await setInvoiceStatus(existing.id, request.body.status);
      return { invoice };
    }
  );

  fastify.delete<{ Params: { id: string } }>("/invoices/:id", { onRequest: [fastify.authenticate] }, async (
    request,
    reply
  ) => {
    if (request.user.role !== "admin") {
      return reply.code(403).send({ error: "Csak admin férhet hozzá a Számlázás modulhoz" });
    }
    const deleted = await deleteInvoice(Number(request.params.id));
    if (!deleted) return reply.code(404).send({ error: "Invoice not found" });
    return { ok: true };
  });
}
