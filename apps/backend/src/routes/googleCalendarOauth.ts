import type { FastifyInstance } from "fastify";
import { saveConnection } from "../db/googleCalendar.js";
import { infoPage } from "../lib/htmlPage.js";
import { exchangeCodeForTokens } from "../lib/googleCalendar/oauth.js";

// Publikus (nem hitelesített) végpont — ide irányít vissza Google a
// consent képernyő után. Az admin a saját böngészőjében nyitja meg a
// folyamatot (nem a Tauri appból), ezért ez is sima, szerver-renderelt HTML.
export default async function googleCalendarOauthRoutes(fastify: FastifyInstance) {
  fastify.get<{ Querystring: { code?: string; error?: string } }>(
    "/admin/google-calendar/oauth-callback",
    async (request, reply) => {
      if (request.query.error) {
        return reply.type("text/html").send(infoPage(`A Google nem engedélyezte a kapcsolódást: ${request.query.error}`));
      }
      if (!request.query.code) {
        return reply.type("text/html").send(infoPage("Hiányzó engedélyezési kód."));
      }
      try {
        const { email, refreshToken } = await exchangeCodeForTokens(request.query.code);
        await saveConnection({ connectedEmail: email, refreshToken });
        return reply
          .type("text/html")
          .send(infoPage(`Sikeresen összekapcsolva a(z) ${email} Google-fiókkal. Visszamehetsz a RunMate CRM alkalmazásba.`));
      } catch (err) {
        fastify.log.error(err, "Google Calendar OAuth callback failed");
        return reply
          .type("text/html")
          .send(infoPage(err instanceof Error ? err.message : "Nem sikerült összekapcsolni a Google-fiókot."));
      }
    }
  );
}
