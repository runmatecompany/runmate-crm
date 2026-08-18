import type { FastifyInstance } from "fastify";
import {
  applyCallAttemptEffects,
  createLeadGenCompany,
  deleteLeadGenCompany,
  getLeadGenCompanyById,
  listLeadGenCallQueue,
  listLeadGenCompanies,
  setLeadGenCompanyAudit,
  updateLeadGenCompany,
  type LeadGenPhoneType,
  type LeadGenSeedSource,
  type LeadGenSocialAssessment,
  type LeadGenStatus,
} from "../db/leadgenCompanies.js";
import { hasLeadGenAccess } from "../db/leadgenAccess.js";
import {
  createLeadGenContact,
  deleteLeadGenContact,
  listLeadGenContacts,
} from "../db/leadgenContacts.js";
import {
  createLeadGenCallAttempt,
  listLeadGenCallAttempts,
  type LeadGenDisposition,
} from "../db/leadgenCallAttempts.js";
import { getLeadGenSettings, updateLeadGenInterestBalancingTest } from "../db/leadgenSettings.js";
import { rescoreLeadGenCompany } from "../lib/leadgen/scoring.js";
import { auditWebsite } from "../lib/leadgen/websiteAudit.js";
import { computeDispositionEffects } from "../lib/leadgen/dispositionEffects.js";
import { importLeadGenCsv, type LeadGenCsvMapping } from "../lib/leadgen/csvImport.js";
import { buildOpeningLine, buildWhyInteresting } from "../lib/leadgen/openingLine.js";

export async function canAccessLeadGenModule(userId: number, role: "admin" | "user"): Promise<boolean> {
  return role === "admin" || (await hasLeadGenAccess(userId));
}

const DISPOSITION_VALUES = [
  "no_answer", "busy", "wrong_number", "gatekeeper_blocked", "gatekeeper_passed",
  "dm_unavailable", "callback_requested", "not_interested", "interested",
  "meeting_booked", "do_not_call",
] as const;

const LEAD_STATUS_VALUES = [
  "new", "qualified", "calling", "callback", "interested", "meeting_booked", "won", "nurture", "lost",
] as const;

const companyBodySchema = {
  type: "object",
  required: ["companyName"],
  properties: {
    companyName: { type: "string", minLength: 1 },
    taxNumber: { type: "string" },
    companyRegistrationNumber: { type: "string" },
    companyType: { type: "string" },
    address: { type: "string" },
    city: { type: "string" },
    county: { type: "string" },
    industry: { type: "string" },
    mainActivity: { type: "string" },
    website: { type: "string" },
    phoneMain: { type: "string" },
    phoneSource: { type: "string" },
    phoneType: { type: "string", enum: ["direct_dm", "central", "contact_form"] },
    revenueCurrent: { type: "number" },
    revenuePrevious: { type: "number" },
    revenueYear: { type: "integer" },
    revenueSource: { type: "string" },
    revenueSourceUrl: { type: "string" },
    employeeCount: { type: "integer" },
    employeeCountConfidence: { type: "string", enum: ["high", "medium", "low"] },
    socialAssessment: { type: "string", enum: ["active_good", "active_weak", "stale", "very_weak", "none"] },
    adRunning: { type: "boolean" },
  },
} as const;

interface CompanyBody {
  companyName: string;
  taxNumber?: string;
  companyRegistrationNumber?: string;
  companyType?: string;
  address?: string;
  city?: string;
  county?: string;
  industry?: string;
  mainActivity?: string;
  website?: string;
  phoneMain?: string;
  phoneSource?: string;
  phoneType?: LeadGenPhoneType;
  revenueCurrent?: number;
  revenuePrevious?: number;
  revenueYear?: number;
  revenueSource?: string;
  revenueSourceUrl?: string;
  employeeCount?: number;
  employeeCountConfidence?: "high" | "medium" | "low";
  socialAssessment?: LeadGenSocialAssessment;
  adRunning?: boolean;
}

const contactBodySchema = {
  type: "object",
  required: ["fullName"],
  properties: {
    fullName: { type: "string", minLength: 1 },
    position: { type: "string" },
    roleType: { type: "string", enum: ["owner", "ceo", "marketing", "other"] },
    phone: { type: "string" },
    phoneExtension: { type: "string" },
    email: { type: "string" },
    linkedinUrl: { type: "string" },
    source: { type: "string" },
    sourceUrl: { type: "string" },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
} as const;

interface ContactBody {
  fullName: string;
  position?: string;
  roleType?: string;
  phone?: string;
  phoneExtension?: string;
  email?: string;
  linkedinUrl?: string;
  source?: string;
  sourceUrl?: string;
  confidence?: "high" | "medium" | "low";
}

const callAttemptBodySchema = {
  type: "object",
  required: ["disposition", "gdprNoticeGiven"],
  properties: {
    contactId: { type: "integer" },
    disposition: { type: "string", enum: [...DISPOSITION_VALUES] },
    gatekeeperName: { type: "string" },
    reachedPerson: { type: "string" },
    durationSeconds: { type: "integer" },
    notes: { type: "string" },
    nextAction: { type: "string" },
    nextCallAt: { type: "string" },
    gdprNoticeGiven: { type: "boolean" },
  },
} as const;

interface CallAttemptBody {
  contactId?: number;
  disposition: LeadGenDisposition;
  gatekeeperName?: string;
  reachedPerson?: string;
  durationSeconds?: number;
  notes?: string;
  nextAction?: string;
  nextCallAt?: string;
  gdprNoticeGiven: boolean;
}

export default async function leadGenRoutes(fastify: FastifyInstance) {
  fastify.get("/leadgen/companies", { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { sub: userId, role } = request.user;
    if (!(await canAccessLeadGenModule(userId, role))) {
      return reply.code(403).send({ error: "Nincs hozzáférésed a Lead Gen modulhoz" });
    }
    const query = request.query as { status?: LeadGenStatus; search?: string; doNotCall?: string };
    const companies = await listLeadGenCompanies({
      status: query.status,
      search: query.search,
      doNotCall: query.doNotCall != null ? query.doNotCall === "true" : undefined,
    });
    return { companies };
  });

  fastify.get("/leadgen/call-queue", { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { sub: userId, role } = request.user;
    if (!(await canAccessLeadGenModule(userId, role))) {
      return reply.code(403).send({ error: "Nincs hozzáférésed a Lead Gen modulhoz" });
    }
    const query = request.query as { limit?: string };
    const limit = query.limit ? Number(query.limit) : 15;
    const companies = await listLeadGenCallQueue(limit);
    return { companies };
  });

  fastify.get<{ Params: { id: string } }>(
    "/leadgen/companies/:id",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { sub: userId, role } = request.user;
      if (!(await canAccessLeadGenModule(userId, role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed a Lead Gen modulhoz" });
      }
      const id = Number(request.params.id);
      const company = await getLeadGenCompanyById(id);
      if (!company) return reply.code(404).send({ error: "Company not found" });
      const [contacts, callAttempts] = await Promise.all([
        listLeadGenContacts(id),
        listLeadGenCallAttempts(id),
      ]);
      const bestContact = contacts.find((c) => c.role_type === "owner" || c.role_type === "ceo") ?? contacts[0];
      const openingLine = buildOpeningLine(company, bestContact?.full_name ?? null);
      const whyInteresting = buildWhyInteresting(company);
      return { company, contacts, callAttempts, openingLine, whyInteresting, bestContact: bestContact ?? null };
    }
  );

  fastify.post<{ Body: CompanyBody }>(
    "/leadgen/companies",
    { onRequest: [fastify.authenticate], schema: { body: companyBodySchema } },
    async (request, reply) => {
      const { sub: userId, role } = request.user;
      if (!(await canAccessLeadGenModule(userId, role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed a Lead Gen modulhoz" });
      }
      const company = await createLeadGenCompany({ ...request.body, seedSource: "manual" as LeadGenSeedSource, createdBy: userId });
      await rescoreLeadGenCompany(company.id);
      const rescored = await getLeadGenCompanyById(company.id);
      return reply.code(201).send({ company: rescored });
    }
  );

  fastify.put<{ Params: { id: string }; Body: CompanyBody }>(
    "/leadgen/companies/:id",
    { onRequest: [fastify.authenticate], schema: { body: companyBodySchema } },
    async (request, reply) => {
      const { sub: userId, role } = request.user;
      if (!(await canAccessLeadGenModule(userId, role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed a Lead Gen modulhoz" });
      }
      const id = Number(request.params.id);
      const company = await updateLeadGenCompany(id, request.body);
      if (!company) return reply.code(404).send({ error: "Company not found" });
      await rescoreLeadGenCompany(id);
      const rescored = await getLeadGenCompanyById(id);
      return { company: rescored };
    }
  );

  fastify.delete<{ Params: { id: string } }>("/leadgen/companies/:id", { onRequest: [fastify.authenticate] }, async (
    request,
    reply
  ) => {
    if (request.user.role !== "admin") {
      return reply.code(403).send({ error: "Csak admin törölhet céget" });
    }
    const deleted = await deleteLeadGenCompany(Number(request.params.id));
    if (!deleted) return reply.code(404).send({ error: "Company not found" });
    return { ok: true };
  });

  // Egyszerű, függőség nélküli weboldal-audit — lásd lib/leadgen/websiteAudit.ts.
  fastify.post<{ Params: { id: string } }>(
    "/leadgen/companies/:id/audit",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { sub: userId, role } = request.user;
      if (!(await canAccessLeadGenModule(userId, role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed a Lead Gen modulhoz" });
      }
      const id = Number(request.params.id);
      const company = await getLeadGenCompanyById(id);
      if (!company) return reply.code(404).send({ error: "Company not found" });
      if (!company.website) {
        return reply.code(400).send({ error: "Nincs megadva weboldal ehhez a céghez" });
      }
      const audit = await auditWebsite(company.website);
      await setLeadGenCompanyAudit(id, audit);
      await rescoreLeadGenCompany(id);
      const rescored = await getLeadGenCompanyById(id);
      return { company: rescored };
    }
  );

  // CSV import: multipart, egy "file" fájl-rész + egy "mapping" JSON mező
  // (oszlopindex -> mezőnév). Lásd lib/leadgen/csvImport.ts.
  fastify.post("/leadgen/companies/import", { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { sub: userId, role } = request.user;
    if (!(await canAccessLeadGenModule(userId, role))) {
      return reply.code(403).send({ error: "Nincs hozzáférésed a Lead Gen modulhoz" });
    }
    let csvText = "";
    let mapping: LeadGenCsvMapping | null = null;
    for await (const part of request.parts()) {
      if (part.type === "file" && part.fieldname === "file") {
        const chunks: Buffer[] = [];
        for await (const chunk of part.file) chunks.push(chunk as Buffer);
        csvText = Buffer.concat(chunks).toString("utf-8");
      } else if (part.type === "field" && part.fieldname === "mapping") {
        try {
          mapping = JSON.parse(part.value as string);
        } catch {
          return reply.code(400).send({ error: "Érvénytelen oszlop-hozzárendelés" });
        }
      }
    }
    if (!csvText) return reply.code(400).send({ error: "Nincs feltöltött CSV fájl" });
    if (!mapping) return reply.code(400).send({ error: "Hiányzik az oszlop-hozzárendelés" });

    const summary = await importLeadGenCsv(csvText, mapping, userId);
    return { summary };
  });

  fastify.post<{ Params: { id: string }; Body: ContactBody }>(
    "/leadgen/companies/:id/contacts",
    { onRequest: [fastify.authenticate], schema: { body: contactBodySchema } },
    async (request, reply) => {
      const { sub: userId, role } = request.user;
      if (!(await canAccessLeadGenModule(userId, role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed a Lead Gen modulhoz" });
      }
      const companyId = Number(request.params.id);
      const company = await getLeadGenCompanyById(companyId);
      if (!company) return reply.code(404).send({ error: "Company not found" });
      const contact = await createLeadGenContact({ ...request.body, companyId });
      await rescoreLeadGenCompany(companyId);
      return reply.code(201).send({ contact });
    }
  );

  fastify.delete<{ Params: { id: string } }>("/leadgen/contacts/:id", { onRequest: [fastify.authenticate] }, async (
    request,
    reply
  ) => {
    const { sub: userId, role } = request.user;
    if (!(await canAccessLeadGenModule(userId, role))) {
      return reply.code(403).send({ error: "Nincs hozzáférésed a Lead Gen modulhoz" });
    }
    const deleted = await deleteLeadGenContact(Number(request.params.id));
    if (!deleted) return reply.code(404).send({ error: "Contact not found" });
    return { ok: true };
  });

  // A hívókártya diszpozíció-gombjai ide postolnak — kemény szabályok:
  // nincs telefonszám -> már a hívólistából is kimarad; max 5 kísérlet és a
  // 24 órás minimum a call-queue lekérdezésben érvényesül; DO_NOT_CALL
  // végleges. A gdpr_notice_given nélkül a hívás nem zárható le.
  fastify.post<{ Params: { id: string }; Body: CallAttemptBody }>(
    "/leadgen/companies/:id/call-attempts",
    { onRequest: [fastify.authenticate], schema: { body: callAttemptBodySchema } },
    async (request, reply) => {
      const { sub: userId, role } = request.user;
      if (!(await canAccessLeadGenModule(userId, role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed a Lead Gen modulhoz" });
      }
      if (!request.body.gdprNoticeGiven) {
        return reply.code(400).send({ error: "A GDPR-tájékoztatás elhangzása nélkül a hívás nem zárható le" });
      }
      const companyId = Number(request.params.id);
      const company = await getLeadGenCompanyById(companyId);
      if (!company) return reply.code(404).send({ error: "Company not found" });
      if (request.body.disposition === "callback_requested" && !request.body.nextCallAt) {
        return reply.code(400).send({ error: "Visszahívás kéréshez kötelező megadni a pontos időpontot" });
      }

      const attempt = await createLeadGenCallAttempt({
        companyId,
        contactId: request.body.contactId,
        calledBy: userId,
        disposition: request.body.disposition,
        gatekeeperName: request.body.gatekeeperName,
        reachedPerson: request.body.reachedPerson,
        durationSeconds: request.body.durationSeconds,
        notes: request.body.notes,
        nextAction: request.body.nextAction,
        nextCallAt: request.body.nextCallAt,
        gdprNoticeGiven: request.body.gdprNoticeGiven,
      });

      const effects = computeDispositionEffects(request.body.disposition, request.body.nextCallAt, company.lead_status);
      await applyCallAttemptEffects(companyId, {
        nextCallAt: effects.nextCallAt,
        leadStatus: effects.leadStatus,
        doNotCall: effects.doNotCall,
        doNotCallReason: effects.doNotCallReason,
      });

      const updated = await getLeadGenCompanyById(companyId);
      return reply.code(201).send({ attempt, company: updated });
    }
  );

  fastify.get<{ Params: { id: string } }>(
    "/leadgen/companies/:id/call-attempts",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { sub: userId, role } = request.user;
      if (!(await canAccessLeadGenModule(userId, role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed a Lead Gen modulhoz" });
      }
      const callAttempts = await listLeadGenCallAttempts(Number(request.params.id));
      return { callAttempts };
    }
  );

  fastify.get("/leadgen/do-not-call", { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { sub: userId, role } = request.user;
    if (!(await canAccessLeadGenModule(userId, role))) {
      return reply.code(403).send({ error: "Nincs hozzáférésed a Lead Gen modulhoz" });
    }
    const companies = await listLeadGenCompanies({ doNotCall: true });
    return { companies };
  });

  fastify.get("/leadgen/settings", { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { sub: userId, role } = request.user;
    if (!(await canAccessLeadGenModule(userId, role))) {
      return reply.code(403).send({ error: "Nincs hozzáférésed a Lead Gen modulhoz" });
    }
    const settings = await getLeadGenSettings();
    return { settings };
  });

  fastify.put<{ Body: { text: string } }>(
    "/leadgen/settings/interest-balancing-test",
    {
      onRequest: [fastify.authenticate],
      schema: { body: { type: "object", required: ["text"], properties: { text: { type: "string" } } } },
    },
    async (request, reply) => {
      if (request.user.role !== "admin") {
        return reply.code(403).send({ error: "Csak admin szerkesztheti az érdekmérlegelési tesztet" });
      }
      const settings = await updateLeadGenInterestBalancingTest(request.body.text);
      return { settings };
    }
  );
}
