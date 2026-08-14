import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import type { MailSecurity } from "../../db/emailAccounts.js";

export interface RawConnectionParams {
  host: string;
  port: number;
  security: MailSecurity;
  username: string;
  password: string;
}

export interface ConnectionTestResult {
  ok: boolean;
  error?: string;
}

export async function testImapConnection(params: RawConnectionParams): Promise<ConnectionTestResult> {
  const client = new ImapFlow({
    host: params.host,
    port: params.port,
    secure: params.security === "tls",
    auth: { user: params.username, pass: params.password },
    logger: false,
  });
  try {
    await client.connect();
    await client.logout();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Ismeretlen hiba" };
  }
}

export async function testSmtpConnection(params: RawConnectionParams): Promise<ConnectionTestResult> {
  const transporter = nodemailer.createTransport({
    host: params.host,
    port: params.port,
    secure: params.security === "tls",
    requireTLS: params.security === "starttls",
    auth: { user: params.username, pass: params.password },
  });
  try {
    await transporter.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Ismeretlen hiba" };
  }
}
