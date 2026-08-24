import type { FastifyInstance } from "fastify";
import { createInvoice, deleteInvoice, getInvoiceById, listInvoices, setInvoiceStatus, updateInvoice, type InvoiceInput, type InvoiceStatus } from "../db/invoices.js";
import { getIssuerSettings, setIssuerSettings, type UpdateIssuerSettingsInput } from "../db/billingIssuerSettings.js";
import { getClientById } from "../db/clients.js";
import { getAccountById } from "../db/emailAccounts.js";
import { sendMail } from "../lib/mail/send.js";
import { buildInvoicePdf } from "../lib/billing/pdf.js";

const invoiceBodySchema = {
  type: "object",
  required: ["clientId", "description", "amount", "issueDate"],
  properties: {
    clientId: { type: "number" },
    description: { type: "string", minLength: 1 },
    amount: { type: "string", minLength: 1 },
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

const issuerSettingsBodySchema = {
  type: "object",
  properties: {
    businessName: { type: "string" },
    address: { type: "string" },
    email: { type: "string" },
    iban: { type: "string" },
    senderAccountId: { type: ["number", "null"] },
  },
} as const;

function invoicePdfFilename(invoiceNumber: string | null): string {
  return `szamla-${invoiceNumber ?? "piszkozat"}.pdf`;
}

// Számlázás — pénzügyi adat, ezért admin-only, nincs egyénileg kiosztható
// <module>_access, ugyanúgy közvetlen role-ellenőrzés, mint a lead-törlésnél.
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

  fastify.get<{ Params: { id: string } }>("/invoices/:id/pdf", { onRequest: [fastify.authenticate] }, async (
    request,
    reply
  ) => {
    if (request.user.role !== "admin") {
      return reply.code(403).send({ error: "Csak admin férhet hozzá a Számlázás modulhoz" });
    }
    const invoice = await getInvoiceById(Number(request.params.id));
    if (!invoice) return reply.code(404).send({ error: "Invoice not found" });
    const client = await getClientById(invoice.client_id);
    if (!client) return reply.code(404).send({ error: "Client not found" });
    const issuer = await getIssuerSettings();
    const pdf = await buildInvoicePdf(invoice, issuer, client);
    reply.header("Content-Disposition", `attachment; filename="${invoicePdfFilename(invoice.invoice_number)}"`);
    return reply.type("application/pdf").send(pdf);
  });

  fastify.post<{ Params: { id: string } }>(
    "/invoices/:id/send-email",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      if (request.user.role !== "admin") {
        return reply.code(403).send({ error: "Csak admin férhet hozzá a Számlázás modulhoz" });
      }
      const invoice = await getInvoiceById(Number(request.params.id));
      if (!invoice) return reply.code(404).send({ error: "Invoice not found" });
      const client = await getClientById(invoice.client_id);
      if (!client) return reply.code(404).send({ error: "Client not found" });
      if (!client.email) {
        return reply.code(400).send({ error: "Az ügyfélnek nincs megadva email címe" });
      }
      const issuer = await getIssuerSettings();
      if (!issuer.sender_account_id) {
        return reply.code(400).send({ error: "Nincs beállítva küldő email-fiók a Kibocsátó adatainál" });
      }
      const account = await getAccountById(issuer.sender_account_id);
      if (!account) {
        return reply.code(400).send({ error: "A beállított küldő email-fiók nem található" });
      }
      const pdf = await buildInvoicePdf(invoice, issuer, client);
      try {
        await sendMail(account, {
          to: client.email,
          subject: `Számla ${invoice.invoice_number ?? ""} — ${issuer.business_name ?? ""}`.trim(),
          html: `<p>Mellékelve küldjük a(z) ${invoice.invoice_number ?? ""} számú számlát.</p>`,
          attachments: [
            { filename: invoicePdfFilename(invoice.invoice_number), content: pdf, contentType: "application/pdf" },
          ],
        });
      } catch (err) {
        fastify.log.error(err, "Failed to send invoice email");
        return reply.code(502).send({ error: "Nem sikerült elküldeni az emailt" });
      }
      return { ok: true };
    }
  );

  fastify.get("/billing/issuer-settings", { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== "admin") {
      return reply.code(403).send({ error: "Csak admin férhet hozzá a Számlázás modulhoz" });
    }
    return { settings: await getIssuerSettings() };
  });

  fastify.put<{ Body: UpdateIssuerSettingsInput }>(
    "/billing/issuer-settings",
    { onRequest: [fastify.authenticate], schema: { body: issuerSettingsBodySchema } },
    async (request, reply) => {
      if (request.user.role !== "admin") {
        return reply.code(403).send({ error: "Csak admin férhet hozzá a Számlázás modulhoz" });
      }
      const settings = await setIssuerSettings(request.body);
      return { settings };
    }
  );
}
