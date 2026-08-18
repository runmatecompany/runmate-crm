import { pool } from "./pool.js";

export interface LeadGenSettingsRow {
  interest_balancing_test_text: string | null;
  interest_balancing_test_version: number;
  interest_balancing_test_updated_at: string | null;
}

export async function getLeadGenSettings(): Promise<LeadGenSettingsRow> {
  const { rows } = await pool.query<LeadGenSettingsRow>(
    `SELECT interest_balancing_test_text, interest_balancing_test_version, interest_balancing_test_updated_at
     FROM leadgen_settings WHERE id = 1`
  );
  return rows[0];
}

export async function updateLeadGenInterestBalancingTest(text: string): Promise<LeadGenSettingsRow> {
  await pool.query(
    `UPDATE leadgen_settings SET
       interest_balancing_test_text = $1,
       interest_balancing_test_version = interest_balancing_test_version + 1,
       interest_balancing_test_updated_at = now()
     WHERE id = 1`,
    [text]
  );
  return getLeadGenSettings();
}
