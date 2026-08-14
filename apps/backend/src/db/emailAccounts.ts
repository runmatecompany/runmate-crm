import { pool } from "./pool.js";
import { encryptSecret } from "../lib/crypto.js";

export type MailSecurity = "tls" | "starttls" | "none";

export interface EmailAccountRow {
  id: number;
  display_name: string;
  from_name: string;
  from_address: string;
  imap_host: string;
  imap_port: number;
  imap_security: MailSecurity;
  imap_username: string;
  imap_password_enc: string;
  smtp_host: string;
  smtp_port: number;
  smtp_security: MailSecurity;
  smtp_username: string;
  smtp_password_enc: string;
  is_active: boolean;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export type EmailAccountAdminView = Omit<EmailAccountRow, "imap_password_enc" | "smtp_password_enc">;

export interface EmailAccountSummary {
  id: number;
  display_name: string;
  from_name: string;
  from_address: string;
}

const ADMIN_VIEW_COLUMNS = `
  id, display_name, from_name, from_address,
  imap_host, imap_port, imap_security, imap_username,
  smtp_host, smtp_port, smtp_security, smtp_username,
  is_active, created_by, created_at, updated_at
`;

export async function listAccountsAdmin(): Promise<EmailAccountAdminView[]> {
  const { rows } = await pool.query<EmailAccountAdminView>(
    `SELECT ${ADMIN_VIEW_COLUMNS} FROM email_accounts ORDER BY display_name`
  );
  return rows;
}

export async function getAccountAdminById(id: number): Promise<EmailAccountAdminView | undefined> {
  const { rows } = await pool.query<EmailAccountAdminView>(
    `SELECT ${ADMIN_VIEW_COLUMNS} FROM email_accounts WHERE id = $1`,
    [id]
  );
  return rows[0];
}

// Belső használatra — a titkosított jelszavakat is tartalmazza. Csak az
// IMAP/SMTP kapcsolódáshoz szabad használni, sosem küldjük ki a kliensnek.
export async function getAccountById(id: number): Promise<EmailAccountRow | undefined> {
  const { rows } = await pool.query<EmailAccountRow>(`SELECT * FROM email_accounts WHERE id = $1`, [id]);
  return rows[0];
}

export interface CreateAccountInput {
  displayName: string;
  fromName: string;
  fromAddress: string;
  imapHost: string;
  imapPort: number;
  imapSecurity: MailSecurity;
  imapUsername: string;
  imapPassword: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: MailSecurity;
  smtpUsername: string;
  smtpPassword: string;
  createdBy: number;
}

export async function createAccount(input: CreateAccountInput): Promise<EmailAccountAdminView> {
  const client = await pool.connect();
  let accountId: number;
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ id: number }>(
      `INSERT INTO email_accounts (
         display_name, from_name, from_address,
         imap_host, imap_port, imap_security, imap_username, imap_password_enc,
         smtp_host, smtp_port, smtp_security, smtp_username, smtp_password_enc,
         created_by
       ) VALUES ($1,$2,$3, $4,$5,$6,$7,$8, $9,$10,$11,$12,$13, $14)
       RETURNING id`,
      [
        input.displayName,
        input.fromName,
        input.fromAddress,
        input.imapHost,
        input.imapPort,
        input.imapSecurity,
        input.imapUsername,
        encryptSecret(input.imapPassword),
        input.smtpHost,
        input.smtpPort,
        input.smtpSecurity,
        input.smtpUsername,
        encryptSecret(input.smtpPassword),
        input.createdBy,
      ]
    );
    accountId = rows[0].id;
    // A létrehozó admin automatikusan hozzáférést kap a saját fiókjához.
    await client.query(
      `INSERT INTO email_account_access (account_id, user_id, granted_by) VALUES ($1, $2, $2)`,
      [accountId, input.createdBy]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  const created = await getAccountAdminById(accountId);
  return created!;
}

export interface UpdateAccountInput {
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
  isActive: boolean;
}

export async function updateAccount(
  id: number,
  input: UpdateAccountInput
): Promise<EmailAccountAdminView | undefined> {
  const { rows } = await pool.query<{ id: number }>(
    `UPDATE email_accounts SET
       display_name = $2, from_name = $3, from_address = $4,
       imap_host = $5, imap_port = $6, imap_security = $7, imap_username = $8,
       imap_password_enc = COALESCE($9, imap_password_enc),
       smtp_host = $10, smtp_port = $11, smtp_security = $12, smtp_username = $13,
       smtp_password_enc = COALESCE($14, smtp_password_enc),
       is_active = $15,
       updated_at = now()
     WHERE id = $1
     RETURNING id`,
    [
      id,
      input.displayName,
      input.fromName,
      input.fromAddress,
      input.imapHost,
      input.imapPort,
      input.imapSecurity,
      input.imapUsername,
      input.imapPassword ? encryptSecret(input.imapPassword) : null,
      input.smtpHost,
      input.smtpPort,
      input.smtpSecurity,
      input.smtpUsername,
      input.smtpPassword ? encryptSecret(input.smtpPassword) : null,
      input.isActive,
    ]
  );
  if (!rows[0]) return undefined;
  return getAccountAdminById(id);
}

export async function deleteAccount(id: number): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM email_accounts WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}

export async function listAccessibleAccountsForUser(userId: number): Promise<EmailAccountSummary[]> {
  const { rows } = await pool.query<EmailAccountSummary>(
    `SELECT a.id, a.display_name, a.from_name, a.from_address
     FROM email_accounts a
     JOIN email_account_access acc ON acc.account_id = a.id
     WHERE acc.user_id = $1 AND a.is_active = true
     ORDER BY a.display_name`,
    [userId]
  );
  return rows;
}

// Adminok minden aktív fiókhoz automatikusan hozzáférnek — a most létrehozottakhoz
// és a jövőben felvettekhez is, külön hozzáférés-kiosztás nélkül.
export async function listAllActiveAccounts(): Promise<EmailAccountSummary[]> {
  const { rows } = await pool.query<EmailAccountSummary>(
    `SELECT id, display_name, from_name, from_address FROM email_accounts WHERE is_active = true ORDER BY display_name`
  );
  return rows;
}

export async function userHasAccountAccess(accountId: number, userId: number): Promise<boolean> {
  const { rowCount } = await pool.query(
    `SELECT 1 FROM email_account_access WHERE account_id = $1 AND user_id = $2`,
    [accountId, userId]
  );
  return (rowCount ?? 0) > 0;
}

// Melyik fiókokhoz fér hozzá egy adott felhasználó — a "Profilok" nézet
// (felhasználó -> modulok/fiókok) ezt használja kiinduló állapotnak.
export async function listAccessibleAccountIdsForUser(userId: number): Promise<number[]> {
  const { rows } = await pool.query<{ account_id: number }>(
    `SELECT account_id FROM email_account_access WHERE user_id = $1`,
    [userId]
  );
  return rows.map((r) => r.account_id);
}

export async function grantAccountAccess(accountId: number, userId: number, grantedBy: number): Promise<void> {
  await pool.query(
    `INSERT INTO email_account_access (account_id, user_id, granted_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (account_id, user_id) DO NOTHING`,
    [accountId, userId, grantedBy]
  );
}

export async function revokeAccountAccess(accountId: number, userId: number): Promise<void> {
  await pool.query(`DELETE FROM email_account_access WHERE account_id = $1 AND user_id = $2`, [accountId, userId]);
}
