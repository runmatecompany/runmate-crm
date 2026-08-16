import type { FastifyInstance } from "fastify";
import { createLeadResearch, getLeadResearchById, listLeadResearch } from "../db/leadResearch.js";
import { getLeadById } from "../db/leads.js";
import { canAccessLeadsModule } from "./leads.js";

// A lead-kutatás ugyanahhoz a modul-hozzáféréshez kötött, mint maga a Leadek
// modul (leads_access) — nincs külön jogosultsági szint rá.
export default async function leadResearchRoutes(fastify: FastifyInstance) {
  // Új kutatás indítása — a tényleges feldolgozás a háttér-ciklusban történik
  // (lib/leadResearch/process.ts, server.ts-ből ütemezve), ez a végpont csak
  // 'pending' állapotban létrehozza a sort.
  fastify.post<{ Params: { id: string } }>(
    "/leads/:id/research",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { sub: userId, role } = request.user;
      if (!(await canAccessLeadsModule(userId, role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed a Leadek modulhoz" });
      }
      const leadId = Number(request.params.id);
      if (!(await getLeadById(leadId))) return reply.code(404).send({ error: "Lead not found" });
      const research = await createLeadResearch(leadId, userId);
      return reply.code(201).send({ research });
    }
  );

  // Az összes kutatás-futás egy leadhez, legújabb elöl — így látszik, mi
  // változott két futás között.
  fastify.get<{ Params: { id: string } }>(
    "/leads/:id/research",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { sub: userId, role } = request.user;
      if (!(await canAccessLeadsModule(userId, role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed a Leadek modulhoz" });
      }
      const leadId = Number(request.params.id);
      if (!(await getLeadById(leadId))) return reply.code(404).send({ error: "Lead not found" });
      const research = await listLeadResearch(leadId);
      return { research };
    }
  );

  // Egyetlen kutatás-futás lekérdezése — ezt pollozza a UI, amíg 'pending'
  // vagy 'running' állapotban van.
  fastify.get<{ Params: { researchId: string } }>(
    "/leads/research/:researchId",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { sub: userId, role } = request.user;
      if (!(await canAccessLeadsModule(userId, role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed a Leadek modulhoz" });
      }
      const research = await getLeadResearchById(Number(request.params.researchId));
      if (!research) return reply.code(404).send({ error: "Research not found" });
      return { research };
    }
  );
}
