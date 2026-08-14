import type { ImapFlowOptions } from "imapflow";
import { decryptSecret } from "../crypto.js";
import type { EmailAccountRow } from "../../db/emailAccounts.js";

export function toImapOptions(account: EmailAccountRow): ImapFlowOptions {
  return {
    host: account.imap_host,
    port: account.imap_port,
    secure: account.imap_security === "tls",
    auth: { user: account.imap_username, pass: decryptSecret(account.imap_password_enc) },
    logger: false,
  };
}

export function toSmtpOptions(account: EmailAccountRow) {
  return {
    host: account.smtp_host,
    port: account.smtp_port,
    secure: account.smtp_security === "tls",
    requireTLS: account.smtp_security === "starttls",
    auth: { user: account.smtp_username, pass: decryptSecret(account.smtp_password_enc) },
  };
}
