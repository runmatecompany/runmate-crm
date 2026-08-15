import type { FastifyInstance } from "fastify";
import { getClientById } from "../db/clients.js";
import { buildIcsEvent } from "../lib/googleCalendar/ics.js";
import { verifyIcsToken } from "../lib/googleCalendar/icsToken.js";

// Publikus (nem hitelesített) végpont — az ügyfélnek küldött emailben lévő
// "Hozzáadás Apple/egyéb naptárhoz" gomb mutat ide. A token aláírt, nem kell
// hozzá bejelentkezés vagy adatbázis-tábla (lásd lib/googleCalendar/icsToken.ts).
export default async function calendarFileRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: { token: string } }>("/calendar/shoot/:token", async (request, reply) => {
    const rawToken = request.params.token.replace(/\.ics$/i, "");
    const payload = verifyIcsToken(rawToken);
    if (!payload) {
      return reply.code(404).send({ error: "Érvénytelen naptár-link" });
    }
    const client = await getClientById(payload.clientId);
    if (!client) {
      return reply.code(404).send({ error: "Ügyfél nem található" });
    }
    const ics = buildIcsEvent({
      uid: `shoot-${payload.clientId}-${payload.isoDate}@runmate-crm`,
      title: `Forgatás — ${client.company_name}`,
      start: new Date(payload.isoDate),
      durationMinutes: 120,
    });
    reply.header("Content-Disposition", 'attachment; filename="forgatas.ics"');
    return reply.type("text/calendar; charset=utf-8").send(ics);
  });
}
