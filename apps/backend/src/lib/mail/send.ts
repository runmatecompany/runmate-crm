import nodemailer from "nodemailer";
import type { EmailAccountRow } from "../../db/emailAccounts.js";
import { toSmtpOptions } from "./config.js";

export interface OutgoingMailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export interface OutgoingMail {
  to: string;
  subject: string;
  html: string;
  attachments?: OutgoingMailAttachment[];
}

// A meglévő "email fiók" SMTP-adataival tényleges levelet küld — a fiók
// eddig csak IMAP/SMTP kapcsolat teszteléséhez (test.ts, .verify()) volt
// használva, kimenő levélküldés eddig sehol nem volt a backendben.
export async function sendMail(account: EmailAccountRow, message: OutgoingMail): Promise<void> {
  const transporter = nodemailer.createTransport(toSmtpOptions(account));
  await transporter.sendMail({
    from: `"${account.from_name}" <${account.from_address}>`,
    to: message.to,
    subject: message.subject,
    html: message.html,
    attachments: message.attachments,
  });
}
