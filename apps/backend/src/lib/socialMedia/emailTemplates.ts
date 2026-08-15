export interface ApprovalEmailContext {
  clientName: string;
  contentTitle: string;
  version: number;
  link: string;
}

export interface EmailContent {
  subject: string;
  html: string;
}

function wrap(bodyHtml: string): string {
  return `
    <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; color: #222;">
      ${bodyHtml}
      <p style="margin-top: 2em; color: #888; font-size: 0.85em;">Ezt az emailt a RunMate CRM automatikusan küldte.</p>
    </div>
  `;
}

export function scriptApprovalEmail(ctx: ApprovalEmailContext): EmailContent {
  return {
    subject: `Jóváhagyásra vár: "${ctx.contentTitle}" script (v${ctx.version})`,
    html: wrap(`
      <p>Kedves ${ctx.clientName}!</p>
      <p>Elkészült a(z) <strong>"${ctx.contentTitle}"</strong> tartalom scriptje, kérnénk a jóváhagyásodat, mielőtt forgatunk.</p>
      <p><a href="${ctx.link}" style="display:inline-block;padding:0.7em 1.4em;background:#2f7fe0;color:#fff;text-decoration:none;border-radius:6px;">Script megtekintése és jóváhagyása</a></p>
      <p>Ha valami nem stimmel, a linken keresztül módosítást is kérhetsz, csak írd le, mit változtatnánk.</p>
    `),
  };
}

export function editApprovalEmail(ctx: ApprovalEmailContext): EmailContent {
  return {
    subject: `Jóváhagyásra vár: "${ctx.contentTitle}" vágás (v${ctx.version})`,
    html: wrap(`
      <p>Kedves ${ctx.clientName}!</p>
      <p>Elkészült a(z) <strong>"${ctx.contentTitle}"</strong> tartalom vágott változata, kérnénk a jóváhagyásodat közzététel előtt.</p>
      <p><a href="${ctx.link}" style="display:inline-block;padding:0.7em 1.4em;background:#2f7fe0;color:#fff;text-decoration:none;border-radius:6px;">Videó megtekintése és jóváhagyása</a></p>
      <p>Ha valami nem stimmel, a linken keresztül módosítást is kérhetsz, csak írd le, mit változtatnánk.</p>
    `),
  };
}

export function reminderEmail(ctx: ApprovalEmailContext, type: "script" | "edit"): EmailContent {
  const base = type === "script" ? scriptApprovalEmail(ctx) : editApprovalEmail(ctx);
  return {
    subject: `Emlékeztető – ${base.subject}`,
    html: wrap(`
      <p>Kedves ${ctx.clientName}!</p>
      <p>Csak egy gyors emlékeztető: még várjuk a visszajelzésedet a(z) <strong>"${ctx.contentTitle}"</strong> tartalommal kapcsolatban.</p>
      <p><a href="${ctx.link}" style="display:inline-block;padding:0.7em 1.4em;background:#2f7fe0;color:#fff;text-decoration:none;border-radius:6px;">Megtekintés és jóváhagyás</a></p>
    `),
  };
}
