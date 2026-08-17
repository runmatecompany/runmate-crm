import { config } from "../../config.js";
import { getAccountById } from "../../db/emailAccounts.js";
import { getSenderAccountId } from "../../db/socialMediaConfig.js";
import type { ApprovalType } from "../../db/contentApprovals.js";
import type { ContentItemRow } from "../../db/contentItems.js";
import { sendMail } from "../mail/send.js";
import { editApprovalEmail, reminderEmail, scriptApprovalEmail, type ApprovalEmailContext } from "./emailTemplates.js";

export class NotifyError extends Error {}

function buildApprovalLink(rawToken: string): string {
  if (!config.publicUrl) {
    throw new NotifyError("A szerveren nincs beállítva PUBLIC_URL, emailt nem lehet küldeni");
  }
  return `${config.publicUrl}/jovahagyas/${rawToken}`;
}

async function resolveSenderAccount() {
  const accountId = await getSenderAccountId();
  if (!accountId) {
    throw new NotifyError("Nincs kijelölve küldő email fiók a Social Media modulhoz (Beállítások > Social Media)");
  }
  const account = await getAccountById(accountId);
  if (!account) {
    throw new NotifyError("A kijelölt küldő email fiók már nem létezik");
  }
  return account;
}

function buildContext(item: ContentItemRow, version: number, link: string): ApprovalEmailContext {
  return {
    clientName: item.client_contact_name ?? item.client_name,
    contentTitle: item.title,
    version,
    link,
  };
}

// Ha az onboarding-profilban meg van adva külön tartalom-jóváhagyó
// kapcsolattartó, a jóváhagyási emailek oda mennek — egyébként a fő
// kapcsolattartói címre.
function requireClientEmail(item: ContentItemRow): string {
  const email = item.client_approval_email || item.client_email;
  if (!email) {
    throw new NotifyError(`"${item.client_name}" ügyfélnek nincs email címe megadva`);
  }
  return email;
}

export async function sendApprovalRequestEmail(
  item: ContentItemRow,
  type: ApprovalType,
  version: number,
  rawToken: string
): Promise<void> {
  const to = requireClientEmail(item);
  const account = await resolveSenderAccount();
  const link = buildApprovalLink(rawToken);
  const content = type === "script" ? scriptApprovalEmail(buildContext(item, version, link)) : editApprovalEmail(buildContext(item, version, link));
  await sendMail(account, { to, ...content });
}

export async function sendApprovalReminderEmail(
  item: ContentItemRow,
  type: ApprovalType,
  version: number,
  rawToken: string
): Promise<void> {
  const to = requireClientEmail(item);
  const account = await resolveSenderAccount();
  const link = buildApprovalLink(rawToken);
  const content = reminderEmail(buildContext(item, version, link), type);
  await sendMail(account, { to, ...content });
}
