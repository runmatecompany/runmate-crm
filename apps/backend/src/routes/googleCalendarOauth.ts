import type { FastifyInstance } from "fastify";
import { saveConnection } from "../db/googleCalendar.js";
import { saveUserDriveConnection } from "../db/userGoogleDrive.js";
import { infoPage } from "../lib/htmlPage.js";
import { exchangeCodeForTokens } from "../lib/googleCalendar/oauth.js";
import { exchangePersonalCode, parsePersonalOAuthState } from "../lib/googleDrive/personalOauth.js";

// Publikus (nem hitelesített) végpont — ide irányít vissza Google a
// consent képernyő után, a böngészőben (nem a Tauri appból), ezért sima,
// szerver-renderelt HTML. UGYANEZ az egy útvonal (és ugyanaz a Google
// Cloud Console-ban regisztrált redirect_uri) szolgálja ki mind a
// globális admin-naptár kapcsolatot, mind a vágónkénti személyes
// Drive-kapcsolatot (lib/googleDrive/personalOauth.ts) — a "state" query
// paraméter dönti el melyikről van szó, hogy ne kelljen második
// redirect_uri-t felvenni Google-nél.
export default async function googleCalendarOauthRoutes(fastify: FastifyInstance) {
  fastify.get<{ Querystring: { code?: string; error?: string; state?: string } }>(
    "/admin/google-calendar/oauth-callback",
    async (request, reply) => {
      if (request.query.error) {
        return reply.type("text/html").send(infoPage(`A Google nem engedélyezte a kapcsolódást: ${request.query.error}`));
      }
      if (!request.query.code) {
        return reply.type("text/html").send(infoPage("Hiányzó engedélyezési kód."));
      }

      const personalUserId = parsePersonalOAuthState(request.query.state);
      if (personalUserId != null) {
        try {
          const { email, refreshToken } = await exchangePersonalCode(request.query.code);
          await saveUserDriveConnection(personalUserId, email, refreshToken);
          return reply
            .type("text/html")
            .send(infoPage(`Sikeresen összekötötted a saját Google-fiókodat (${email}). Visszamehetsz a RunMate CRM alkalmazásba.`));
        } catch (err) {
          fastify.log.error(err, "Personal Google Drive OAuth callback failed");
          return reply
            .type("text/html")
            .send(infoPage(err instanceof Error ? err.message : "Nem sikerült összekötni a Google-fiókodat."));
        }
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
