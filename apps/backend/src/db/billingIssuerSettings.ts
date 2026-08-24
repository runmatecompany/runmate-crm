import { pool } from "./pool.js";

export interface BillingIssuerSettings {
  business_name: string | null;
  address: string | null;
  email: string | null;
  iban: string | null;
  sender_account_id: number | null;
}

export async function getIssuerSettings(): Promise<BillingIssuerSettings> {
  const { rows } = await pool.query<BillingIssuerSettings>(
    `SELECT business_name, address, email, iban, sender_account_id FROM billing_issuer_settings WHERE id = 1`
  );
  return rows[0] ?? { business_name: null, address: null, email: null, iban: null, sender_account_id: null };
}

export interface UpdateIssuerSettingsInput {
  businessName?: string;
  address?: string;
  email?: string;
  iban?: string;
  senderAccountId?: number | null;
}

export async function setIssuerSettings(input: UpdateIssuerSettingsInput): Promise<BillingIssuerSettings> {
  await pool.query(
    `UPDATE billing_issuer_settings SET
       business_name = $1, address = $2, email = $3, iban = $4, sender_account_id = $5
     WHERE id = 1`,
    [
      input.businessName ?? null,
      input.address ?? null,
      input.email ?? null,
      input.iban ?? null,
      input.senderAccountId ?? null,
    ]
  );
  return getIssuerSettings();
}
