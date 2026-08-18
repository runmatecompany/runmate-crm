import { pool } from "./pool.js";
import type { LeadGenConfidence } from "./leadgenCompanies.js";

export interface LeadGenContactRow {
  id: number;
  company_id: number;
  full_name: string;
  position: string | null;
  role_type: string | null;
  phone: string | null;
  phone_extension: string | null;
  email: string | null;
  linkedin_url: string | null;
  source: string | null;
  source_url: string | null;
  confidence: LeadGenConfidence | null;
  verified: boolean;
  verified_at: string | null;
  created_at: string;
}

const CONTACT_SELECT = `
  SELECT id, company_id, full_name, position, role_type, phone, phone_extension, email,
         linkedin_url, source, source_url, confidence, verified, verified_at, created_at
  FROM leadgen_contacts
`;

export async function listLeadGenContacts(companyId: number): Promise<LeadGenContactRow[]> {
  const { rows } = await pool.query<LeadGenContactRow>(
    `${CONTACT_SELECT} WHERE company_id = $1 ORDER BY created_at ASC`,
    [companyId]
  );
  return rows;
}

export interface CreateLeadGenContactInput {
  companyId: number;
  fullName: string;
  position?: string;
  roleType?: string;
  phone?: string;
  phoneExtension?: string;
  email?: string;
  linkedinUrl?: string;
  source?: string;
  sourceUrl?: string;
  confidence?: LeadGenConfidence;
}

export async function createLeadGenContact(input: CreateLeadGenContactInput): Promise<LeadGenContactRow> {
  const { rows } = await pool.query<LeadGenContactRow>(
    `INSERT INTO leadgen_contacts
       (company_id, full_name, position, role_type, phone, phone_extension, email,
        linkedin_url, source, source_url, confidence)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id, company_id, full_name, position, role_type, phone, phone_extension, email,
               linkedin_url, source, source_url, confidence, verified, verified_at, created_at`,
    [
      input.companyId,
      input.fullName,
      input.position ?? null,
      input.roleType ?? null,
      input.phone ?? null,
      input.phoneExtension ?? null,
      input.email ?? null,
      input.linkedinUrl ?? null,
      input.source ?? null,
      input.sourceUrl ?? null,
      input.confidence ?? null,
    ]
  );
  return rows[0];
}

export async function deleteLeadGenContact(id: number): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM leadgen_contacts WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}
