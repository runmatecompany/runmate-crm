import { config } from "../../config.js";
import { getAccountById } from "../../db/emailAccounts.js";
import { getSenderAccountId } from "../../db/socialMediaConfig.js";
import type { ClientRow } from "../../db/clients.js";
import { sendMail } from "../mail/send.js";
import { shootDateConfirmedEmail } from "../socialMedia/emailTemplates.js";
import { toIcsDate } from "./ics.js";
import { buildIcsToken } from "./icsToken.js";

export class NotifyError extends Error {}

const SHOOT_DURATION_MINUTES = 120;

export async function sendShootDateConfirmedEmail(client: ClientRow, shootDate: Date): Promise<void> {
  if (!client.email) {
    throw new NotifyError(`"${client.company_name}" ügyfélnek nincs email címe megadva`);
  }
  if (!config.publicUrl) {
    throw new NotifyError("A szerveren nincs beállítva PUBLIC_URL, emailt nem lehet küldeni");
  }
  const accountId = await getSenderAccountId();
  if (!accountId) {
    throw new NotifyError("Nincs kijelölve küldő email fiók a Social Media modulhoz (Beállítások > Social Media)");
  }
  const account = await getAccountById(accountId);
  if (!account) {
    throw new NotifyError("A kijelölt küldő email fiók már nem létezik");
  }

  const end = new Date(shootDate.getTime() + SHOOT_DURATION_MINUTES * 60_000);
  const title = `Forgatás — ${client.company_name}`;
  const googleAddUrl = new URL("https://calendar.google.com/calendar/render");
  googleAddUrl.searchParams.set("action", "TEMPLATE");
  googleAddUrl.searchParams.set("text", title);
  googleAddUrl.searchParams.set("dates", `${toIcsDate(shootDate)}/${toIcsDate(end)}`);

  const icsToken = buildIcsToken({ clientId: client.id, isoDate: shootDate.toISOString() });
  const icsUrl = `${config.publicUrl}/calendar/shoot/${icsToken}.ics`;

  const shootDateLabel = shootDate.toLocaleString("hu-HU", { dateStyle: "full", timeStyle: "short" });
  const content = shootDateConfirmedEmail({
    clientName: client.contact_name ?? client.company_name,
    shootDateLabel,
    googleAddUrl: googleAddUrl.toString(),
    icsUrl,
  });

  await sendMail(account, { to: client.email, ...content });
}
