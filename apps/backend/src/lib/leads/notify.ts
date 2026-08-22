import { getAccountById } from "../../db/emailAccounts.js";
import { getSenderAccountId } from "../../db/socialMediaConfig.js";
import type { LeadRow } from "../../db/leads.js";
import { sendMail } from "../mail/send.js";
import { contractSentEmail, invoiceSentEmail } from "./emailTemplates.js";

// Ugyanazt a küldő email-fiókot használja, amit a Social Media modulhoz
// állítottak be (Beállítások > Social Media) — nincs külön HR-specifikus
// küldő-fiók beállítás, ezt a meglévő, egyetlen konfigurált céges kimenő
// fiókot érdemes újrahasznosítani, ahogy a forgatás-emlékeztető is teszi
// (lib/googleCalendar/notify.ts).
async function resolveSenderAccount() {
  const accountId = await getSenderAccountId();
  if (!accountId) return null;
  return getAccountById(accountId);
}

// Szándékosan csendben, hiba nélkül tér vissza (nem dob), ha nincs
// email-cím a leadnél vagy nincs beállítva küldő fiók — a szerződés/számla
// link elmentése ettől függetlenül sikeres marad, a hívó fél csak egy
// figyelmeztető jelzést kap vissza (lásd routes/leads.ts), nem hibát.
export async function sendContractLinkEmail(lead: LeadRow, driveLink: string): Promise<boolean> {
  if (!lead.email) return false;
  const account = await resolveSenderAccount();
  if (!account) return false;
  const content = contractSentEmail({
    contactName: lead.contact_name ?? lead.company_name,
    companyName: lead.company_name,
    driveLink,
  });
  await sendMail(account, { to: lead.email, ...content });
  return true;
}

export async function sendInvoiceLinkEmail(lead: LeadRow, driveLink: string): Promise<boolean> {
  if (!lead.email) return false;
  const account = await resolveSenderAccount();
  if (!account) return false;
  const content = invoiceSentEmail({
    contactName: lead.contact_name ?? lead.company_name,
    companyName: lead.company_name,
    driveLink,
  });
  await sendMail(account, { to: lead.email, ...content });
  return true;
}
