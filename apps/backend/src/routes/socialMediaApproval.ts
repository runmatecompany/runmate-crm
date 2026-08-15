import type { FastifyInstance } from "fastify";
import { getApprovalByTokenHash } from "../db/contentApprovals.js";
import { getContentItemById } from "../db/contentItems.js";
import { escapeHtml, infoPage, renderPage } from "../lib/htmlPage.js";
import { hashApprovalToken } from "../lib/socialMedia/token.js";
import { transitionContentItem, TransitionError } from "../lib/socialMedia/transitions.js";

export default async function socialMediaApprovalRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: { token: string } }>("/jovahagyas/:token", async (request, reply) => {
    const hash = hashApprovalToken(request.params.token);
    const approval = await getApprovalByTokenHash(hash);

    if (!approval) {
      return reply.type("text/html").send(infoPage("Ez a link érvénytelen."));
    }
    if (new Date(approval.token_expires_at).getTime() < Date.now()) {
      return reply.type("text/html").send(infoPage("Ez a link már nem érvényes, kérlek vedd fel a kapcsolatot velünk."));
    }
    if (approval.status !== "pending") {
      const already = approval.status === "approved" ? "jóváhagytad" : "módosítást kértél hozzá";
      return reply.type("text/html").send(infoPage(`Ezt a tartalmat már korábban ${already}, köszönjük!`));
    }

    const item = await getContentItemById(approval.content_item_id);
    if (!item) {
      return reply.type("text/html").send(infoPage("Ez a tartalom már nem található."));
    }

    const typeLabel = approval.type === "script" ? "script" : "vágott anyag";
    const contentHtml =
      approval.type === "script"
        ? `<div class="sm-snapshot">${escapeHtml(approval.snapshot)}</div>`
        : `<p><a class="sm-video-link" href="${escapeHtml(approval.snapshot)}" target="_blank" rel="noreferrer">Videó megtekintése</a></p>`;

    const html = `
      <div class="sm-card">
        <h1>${escapeHtml(item.title)} — ${typeLabel} (v${approval.version})</h1>
        <p class="sm-meta">${escapeHtml(item.client_contact_name ?? item.client_name)} részére</p>
        ${contentHtml}
        <form method="POST" action="/jovahagyas/${encodeURIComponent(request.params.token)}">
          <label for="sm-name">A neved</label>
          <input type="text" id="sm-name" name="name" required>
          <label for="sm-feedback">Ha módosítást kérsz, írd le itt, mit változtatnánk (jóváhagyáshoz nem kell kitölteni)</label>
          <textarea id="sm-feedback" name="feedback" rows="3"></textarea>
          <button type="submit" name="decision" value="approve">Jóváhagyom</button>
          <button type="submit" name="decision" value="reject">Módosítást kérek</button>
        </form>
      </div>
    `;
    return reply.type("text/html").send(renderPage(`${item.title} — jóváhagyás`, html));
  });

  fastify.post<{ Params: { token: string }; Body: { decision: string; name?: string; feedback?: string } }>(
    "/jovahagyas/:token",
    async (request, reply) => {
      const hash = hashApprovalToken(request.params.token);
      const approval = await getApprovalByTokenHash(hash);

      if (!approval || approval.status !== "pending" || new Date(approval.token_expires_at).getTime() < Date.now()) {
        return reply.type("text/html").send(infoPage("Ez a link már nem érvényes."));
      }
      const name = request.body.name?.trim();
      if (!name) {
        return reply.type("text/html").send(infoPage("A név megadása kötelező, kérlek próbáld újra a linkről."));
      }
      if (request.body.decision !== "approve" && request.body.decision !== "reject") {
        return reply.type("text/html").send(infoPage("Érvénytelen kérés."));
      }

      const action =
        approval.type === "script"
          ? request.body.decision === "approve"
            ? "approve_script"
            : "reject_script"
          : request.body.decision === "approve"
            ? "approve_edit"
            : "reject_edit";

      try {
        await transitionContentItem(approval.content_item_id, action, { feedback: request.body.feedback }, name);
      } catch (err) {
        if (err instanceof TransitionError) {
          return reply.type("text/html").send(infoPage(err.message));
        }
        throw err;
      }

      const thankYouMessage =
        request.body.decision === "approve"
          ? "Köszönjük a jóváhagyást!"
          : "Köszönjük a visszajelzést, hamarosan jelentkezünk a módosítással!";
      return reply.type("text/html").send(infoPage(thankYouMessage));
    }
  );
}
