import { pool } from "./pool.js";

// Az Értékesítés pipeline állapotai. A "call_back" bármelyik nem-lezárt
// állapotból felvehető (univerzális "most nem értem el" jelölés, lásd
// routes/leads.ts) — nem egy fix, lineáris lépés, hanem oda-vissza
// mozgatható jelölő. A "became_customer"/"interested"/"contract_sent"/
// "invoice_sent" a DB CHECK constraint korábbi verzióiban léteztek, a
// 052-es migráció óta már nem elérhető állapotok (a Kanban nem ajánlja fel).
export type LeadStatus =
  | "to_call"
  | "call_back"
  | "audit"
  | "meeting_scheduled"
  | "decision_pending"
  | "accepted"
  | "not_interested"
  | "declined";

export interface LeadRow {
  id: number;
  company_name: string;
  contact_name: string | null;
  contact_position: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  notes: string | null;
  sector: "b2b" | "b2c" | null;
  website_url: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  youtube_url: string | null;
  status: LeadStatus;
  meeting_date: string | null;
  call_back_reason: string | null;
  contract_drive_link: string | null;
  contract_sent_at: string | null;
  invoice_drive_link: string | null;
  invoice_sent_at: string | null;
  created_by: number | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

const LEAD_SELECT = `
  SELECT
    l.id, l.company_name, l.contact_name, l.contact_position, l.phone, l.email, l.address, l.city, l.notes,
    l.sector, l.website_url, l.facebook_url, l.instagram_url, l.tiktok_url, l.youtube_url,
    l.status, l.meeting_date, l.call_back_reason, l.contract_drive_link, l.contract_sent_at,
    l.invoice_drive_link, l.invoice_sent_at,
    l.created_by, cu.name AS created_by_name,
    l.created_at, l.updated_at
  FROM leads l
  LEFT JOIN users cu ON cu.id = l.created_by
`;

export async function listAllLeads(): Promise<LeadRow[]> {
  const { rows } = await pool.query<LeadRow>(`${LEAD_SELECT} ORDER BY l.created_at DESC`);
  return rows;
}

export async function getLeadById(id: number): Promise<LeadRow | undefined> {
  const { rows } = await pool.query<LeadRow>(`${LEAD_SELECT} WHERE l.id = $1`, [id]);
  return rows[0];
}

export interface CreateLeadInput {
  companyName: string;
  contactName?: string;
  contactPosition?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  notes?: string;
  websiteUrl?: string;
  facebookUrl?: string;
  instagramUrl?: string;
  tiktokUrl?: string;
  youtubeUrl?: string;
  createdBy: number;
}

export async function createLead(input: CreateLeadInput): Promise<LeadRow> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO leads (company_name, contact_name, contact_position, phone, email, address, city, notes,
       website_url, facebook_url, instagram_url, tiktok_url, youtube_url, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING id`,
    [
      input.companyName,
      input.contactName ?? null,
      input.contactPosition ?? null,
      input.phone ?? null,
      input.email ?? null,
      input.address ?? null,
      input.city ?? null,
      input.notes ?? null,
      input.websiteUrl ?? null,
      input.facebookUrl ?? null,
      input.instagramUrl ?? null,
      input.tiktokUrl ?? null,
      input.youtubeUrl ?? null,
      input.createdBy,
    ]
  );
  const created = await getLeadById(rows[0].id);
  return created!;
}

export interface UpdateLeadDetailsInput {
  companyName: string;
  contactName?: string;
  contactPosition?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  notes?: string;
  sector?: "b2b" | "b2c";
  websiteUrl?: string;
  facebookUrl?: string;
  instagramUrl?: string;
  tiktokUrl?: string;
  youtubeUrl?: string;
}

export async function updateLeadDetails(id: number, input: UpdateLeadDetailsInput): Promise<LeadRow | undefined> {
  const { rowCount } = await pool.query(
    `UPDATE leads SET
       company_name = $2, contact_name = $3, contact_position = $4, phone = $5, email = $6, address = $7,
       city = $8, notes = $9, sector = $10, website_url = $11, facebook_url = $12, instagram_url = $13,
       tiktok_url = $14, youtube_url = $15,
       updated_at = now()
     WHERE id = $1`,
    [
      id,
      input.companyName,
      input.contactName ?? null,
      input.contactPosition ?? null,
      input.phone ?? null,
      input.email ?? null,
      input.address ?? null,
      input.city ?? null,
      input.notes ?? null,
      input.sector ?? null,
      input.websiteUrl ?? null,
      input.facebookUrl ?? null,
      input.instagramUrl ?? null,
      input.tiktokUrl ?? null,
      input.youtubeUrl ?? null,
    ]
  );
  if (!rowCount) return undefined;
  return getLeadById(id);
}

export interface UpdateLeadStatusExtra {
  note?: string;
  meetingDate?: string;
  address?: string;
  callBackReason?: string;
}

// A jegyzet (ha meg van adva) mindig a meglévő jegyzetek végéhez fűződik,
// sosem írja felül őket — ez az állapotváltásokhoz kötött indoklások
// (Nem érdekli, Nemet mondott) egységes naplózási módja. A
// call_back_reason viszont felülíródik/törlődik: csak akkor marad meg,
// ha az új állapot maga is "call_back" — minden más állapotba lépéskor
// nullázódik, hogy ne maradjon ott egy régi indoklás egy újra visszahívott
// leadnél.
export async function updateLeadStatus(
  id: number,
  status: LeadStatus,
  extra?: UpdateLeadStatusExtra
): Promise<LeadRow | undefined> {
  const note = extra?.note;
  const { rowCount } = await pool.query(
    `UPDATE leads SET
       status = $2,
       notes = CASE WHEN $3::text IS NOT NULL THEN COALESCE(notes || E'\n', '') || $3 ELSE notes END,
       meeting_date = COALESCE($4::date, meeting_date),
       address = COALESCE($5::text, address),
       call_back_reason = CASE WHEN $2 = 'call_back' THEN COALESCE($6::text, call_back_reason) ELSE NULL END,
       updated_at = now()
     WHERE id = $1`,
    [id, status, note ?? null, extra?.meetingDate ?? null, extra?.address ?? null, extra?.callBackReason ?? null]
  );
  if (!rowCount) return undefined;
  return getLeadById(id);
}

export async function deleteLead(id: number): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM leads WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}

export class DuplicateClientError extends Error {}

// Egy lead "ügyféllé alakítása": létrejön a hozzá tartozó Ügyfelek-sor (a
// lead adataival előtöltve, lead_id-vel visszakötve), a lead-kutatásnál
// megadott weboldal/social linkek átkerülnek az AI-profilba, majd maga a
// lead törlődik — egyetlen tranzakcióban, hogy a táblák sose fussanak szét.
// Előtte ellenőrzi, hogy nincs-e már azonos nevű ügyfél, nehogy duplikátum
// jöjjön létre.
export async function convertLeadToClient(leadId: number, createdBy: number): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: leadRows } = await client.query<LeadRow>(`${LEAD_SELECT} WHERE l.id = $1`, [leadId]);
    const lead = leadRows[0];
    if (!lead) {
      throw new Error("Lead not found");
    }

    const { rows: existing } = await client.query(
      `SELECT id FROM clients WHERE LOWER(TRIM(company_name)) = LOWER(TRIM($1))`,
      [lead.company_name]
    );
    if (existing[0]) {
      throw new DuplicateClientError(`"${lead.company_name}" néven már létezik ügyfél az Ügyfelek listában.`);
    }

    const { rows: created } = await client.query<{ id: number }>(
      `INSERT INTO clients (company_name, contact_name, phone, email, address, notes, lead_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [lead.company_name, lead.contact_name, lead.phone, lead.email, lead.address, lead.notes, lead.id, createdBy]
    );

    // A lead-kutatásnál már megadott weboldal/social linkek (vagy a "-"
    // jelzés, hogy nincs) átkerülnek az onboarding-profilba, hogy a
    // kérdőívnél ne kelljen újra megkérdezni.
    if (lead.website_url || lead.facebook_url || lead.instagram_url || lead.tiktok_url || lead.youtube_url) {
      await client.query(
        `INSERT INTO client_onboarding_profiles (client_id, website_url, facebook_url, instagram_url, tiktok_url, youtube_url)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (client_id) DO NOTHING`,
        [created[0].id, lead.website_url, lead.facebook_url, lead.instagram_url, lead.tiktok_url, lead.youtube_url]
      );
    }

    await client.query(`DELETE FROM leads WHERE id = $1`, [leadId]);

    await client.query("COMMIT");
    return created[0].id;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// A teljes "Leadek" modulhoz való hozzáférés — nem lead-enkénti, hanem
// modul-szintű: akinek van hozzáférése, az az összes leadet látja.
export async function hasLeadsAccess(userId: number): Promise<boolean> {
  const { rowCount } = await pool.query(`SELECT 1 FROM leads_access WHERE user_id = $1`, [userId]);
  return (rowCount ?? 0) > 0;
}

export async function grantLeadsAccess(userId: number, grantedBy: number): Promise<void> {
  await pool.query(
    `INSERT INTO leads_access (user_id, granted_by) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING`,
    [userId, grantedBy]
  );
}

export async function revokeLeadsAccess(userId: number): Promise<void> {
  await pool.query(`DELETE FROM leads_access WHERE user_id = $1`, [userId]);
}
