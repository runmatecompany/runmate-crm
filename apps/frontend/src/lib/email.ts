import { authFetch } from "./api";

export type MailSecurity = "tls" | "starttls" | "none";

export interface EmailAccountSummary {
  id: number;
  display_name: string;
  from_name: string;
  from_address: string;
}

export interface EmailAccountAdminView {
  id: number;
  display_name: string;
  from_name: string;
  from_address: string;
  imap_host: string;
  imap_port: number;
  imap_security: MailSecurity;
  imap_username: string;
  smtp_host: string;
  smtp_port: number;
  smtp_security: MailSecurity;
  smtp_username: string;
  is_active: boolean;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface MailFolder {
  path: string;
  name: string;
  specialUse: string | null;
}

export interface MailAddress {
  name: string | null;
  address: string | null;
}

export interface MailMessageSummary {
  uid: number;
  subject: string | null;
  from: MailAddress | null;
  date: string | null;
  seen: boolean;
  flagged: boolean;
}

export interface MailMessage {
  uid: number;
  subject: string | null;
  from: MailAddress | null;
  to: MailAddress[];
  cc: MailAddress[];
  date: string | null;
  text: string | null;
  html: string | null;
  messageId: string | null;
}

export interface EmailAccountFormInput {
  displayName: string;
  fromName: string;
  fromAddress: string;
  imapHost: string;
  imapPort: number;
  imapSecurity: MailSecurity;
  imapUsername: string;
  imapPassword?: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: MailSecurity;
  smtpUsername: string;
  smtpPassword?: string;
}

export interface ConnectionTestResult {
  ok: boolean;
  error?: string;
}

// --- Felhasználói (mindenkinek elérhető, csak a saját fiókjaihoz) ---

export async function listEmailAccounts(token: string): Promise<EmailAccountSummary[]> {
  const res = await authFetch(token, "/email-accounts");
  const data = await res.json();
  return data.accounts;
}

export async function listFolders(token: string, accountId: number): Promise<MailFolder[]> {
  const res = await authFetch(token, `/email-accounts/${accountId}/folders`);
  const data = await res.json();
  return data.folders;
}

export async function listMessages(
  token: string,
  accountId: number,
  folder: string,
  opts: { limit?: number; beforeUid?: number } = {}
): Promise<MailMessageSummary[]> {
  const params = new URLSearchParams({ folder });
  if (opts.limit) params.set("limit", String(opts.limit));
  if (opts.beforeUid) params.set("beforeUid", String(opts.beforeUid));
  const res = await authFetch(token, `/email-accounts/${accountId}/messages?${params.toString()}`);
  const data = await res.json();
  return data.messages;
}

export async function getMessage(
  token: string,
  accountId: number,
  uid: number,
  folder: string,
  peek = false
): Promise<MailMessage> {
  const params = new URLSearchParams({ folder });
  if (peek) params.set("peek", "1");
  const res = await authFetch(token, `/email-accounts/${accountId}/messages/${uid}?${params.toString()}`);
  const data = await res.json();
  return data.message;
}

export async function setMessageFlag(
  token: string,
  accountId: number,
  uid: number,
  folder: string,
  flags: { seen?: boolean; flagged?: boolean }
): Promise<void> {
  await authFetch(token, `/email-accounts/${accountId}/messages/${uid}/flags?folder=${encodeURIComponent(folder)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(flags),
  });
}

export interface SendMailInput {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text: string;
  inReplyToUid?: number;
  inReplyToFolder?: string;
}

export async function sendMail(token: string, accountId: number, input: SendMailInput): Promise<void> {
  await authFetch(token, `/email-accounts/${accountId}/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

// --- Admin ---

export async function listAdminEmailAccounts(token: string): Promise<EmailAccountAdminView[]> {
  const res = await authFetch(token, "/admin/email-accounts");
  const data = await res.json();
  return data.accounts;
}

export async function createEmailAccount(
  token: string,
  input: EmailAccountFormInput
): Promise<EmailAccountAdminView> {
  const res = await authFetch(token, "/admin/email-accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  return data.account;
}

export async function updateEmailAccount(
  token: string,
  id: number,
  input: EmailAccountFormInput & { isActive: boolean }
): Promise<EmailAccountAdminView> {
  const res = await authFetch(token, `/admin/email-accounts/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  return data.account;
}

export async function deleteEmailAccount(token: string, id: number): Promise<void> {
  await authFetch(token, `/admin/email-accounts/${id}`, { method: "DELETE" });
}

export interface TestConnectionInput {
  accountId?: number;
  imap: { host: string; port: number; security: MailSecurity; username: string; password?: string };
  smtp: { host: string; port: number; security: MailSecurity; username: string; password?: string };
}

export async function testEmailAccountConnection(
  token: string,
  input: TestConnectionInput
): Promise<{ imap: ConnectionTestResult; smtp: ConnectionTestResult }> {
  const res = await authFetch(token, "/admin/email-accounts/test-connection", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return res.json();
}
