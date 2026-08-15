import { pool } from "./pool.js";

// Egysoros konfiguráció: melyik email_accounts fiók küldi a Social Media
// modul jóváhagyás-kérő és emlékeztető leveleit.
export async function getSenderAccountId(): Promise<number | null> {
  const { rows } = await pool.query<{ sender_account_id: number | null }>(
    `SELECT sender_account_id FROM social_media_config WHERE id = 1`
  );
  return rows[0]?.sender_account_id ?? null;
}

export async function setSenderAccountId(accountId: number | null): Promise<void> {
  await pool.query(`UPDATE social_media_config SET sender_account_id = $1 WHERE id = 1`, [accountId]);
}
