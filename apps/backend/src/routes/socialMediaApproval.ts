import type { FastifyInstance } from "fastify";
import { getApprovalByTokenHash } from "../db/contentApprovals.js";
import { getContentItemById } from "../db/contentItems.js";
import { hashApprovalToken } from "../lib/socialMedia/token.js";
import { transitionContentItem, TransitionError } from "../lib/socialMedia/transitions.js";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderPage(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="hu">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 560px; margin: 3em auto; padding: 0 1.2em; color: #1a1a1a; background: #fafafa; line-height: 1.5; }
  h1 { font-size: 1.35em; }
  .sm-meta { color: #666; font-size: 0.9em; margin-bottom: 1.2em; }
  .sm-snapshot { white-space: pre-wrap; background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 1em; margin: 1em 0; }
  .sm-video-link { display: inline-block; padding: 0.7em 1.2em; background: #2f7fe0; color: #fff; text-decoration: none; border-radius: 6px; margin: 0.4em 0 1.2em; }
  label { display: block; font-weight: 600; margin-bottom: 0.3em; font-size: 0.92em; }
  input[type=text], textarea { width: 100%; padding: 0.6em; margin: 0 0 1em; border: 1px solid #ccc; border-radius: 6px; font-family: inherit; font-size: 1em; box-sizing: border-box; }
  button { padding: 0.75em 1.4em; border: none; border-radius: 6px; font-size: 1em; cursor: pointer; margin-right: 0.6em; margin-bottom: 0.6em; }
  button[value=approve] { background: #2f7fe0; color: #fff; }
  button[value=reject] { background: #e6e6e6; color: #333; }
  .sm-card { background: #fff; border: 1px solid #e2e2e2; border-radius: 10px; padding: 1.2em 1.4em; }
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

function infoPage(message: string): string {
  return renderPage("RunMate CRM", `<div class="sm-card"><p>${escapeHtml(message)}</p></div>`);
}

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
