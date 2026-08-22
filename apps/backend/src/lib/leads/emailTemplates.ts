import { wrap, type EmailContent } from "../socialMedia/emailTemplates.js";

export interface DriveLinkEmailContext {
  contactName: string;
  companyName: string;
  driveLink: string;
}

export function contractSentEmail(ctx: DriveLinkEmailContext): EmailContent {
  return {
    subject: `Szerződés — ${ctx.companyName}`,
    html: wrap(`
      <p>Kedves ${ctx.contactName}!</p>
      <p>Elkészítettük a szerződést a(z) <strong>${ctx.companyName}</strong> részére, az alábbi linken éred el:</p>
      <p><a href="${ctx.driveLink}" style="display:inline-block;padding:0.7em 1.4em;background:#2f7fe0;color:#fff;text-decoration:none;border-radius:6px;">Szerződés megtekintése</a></p>
      <p>Ha bármi kérdésed van vele kapcsolatban, keress minket bátran.</p>
    `),
  };
}

export function invoiceSentEmail(ctx: DriveLinkEmailContext): EmailContent {
  return {
    subject: `Számla — ${ctx.companyName}`,
    html: wrap(`
      <p>Kedves ${ctx.contactName}!</p>
      <p>Elkészítettük a számlát a(z) <strong>${ctx.companyName}</strong> részére, az alábbi linken éred el:</p>
      <p><a href="${ctx.driveLink}" style="display:inline-block;padding:0.7em 1.4em;background:#2f7fe0;color:#fff;text-decoration:none;border-radius:6px;">Számla megtekintése</a></p>
    `),
  };
}
