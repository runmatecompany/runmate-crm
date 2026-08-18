import { pool } from "./pool.js";

export type LeadGenSeedSource = "csv" | "maps" | "ad_library" | "catalog" | "manual";
export type LeadGenConfidence = "high" | "medium" | "low";
export type LeadGenSocialAssessment = "active_good" | "active_weak" | "stale" | "very_weak" | "none";
export type LeadGenTemperature = "hot" | "warm" | "potential" | "low_priority";
export type LeadGenPhoneType = "direct_dm" | "central" | "contact_form";
export type LeadGenStatus =
  | "new"
  | "qualified"
  | "calling"
  | "callback"
  | "interested"
  | "meeting_booked"
  | "won"
  | "nurture"
  | "lost";

export interface LeadGenCompanyRow {
  id: number;
  company_name: string;
  tax_number: string | null;
  company_registration_number: string | null;
  company_type: string | null;
  address: string | null;
  city: string | null;
  county: string | null;
  industry: string | null;
  main_activity: string | null;
  website: string | null;
  website_status: string | null;
  website_mobile_friendly: boolean | null;
  website_title: string | null;
  phone_main: string | null;
  phone_source: string | null;
  phone_type: LeadGenPhoneType | null;
  phone_verified: boolean;
  revenue_current: string | null;
  revenue_previous: string | null;
  revenue_year: number | null;
  revenue_source: string | null;
  revenue_source_url: string | null;
  revenue_verified: boolean;
  revenue_verified_at: string | null;
  employee_count: number | null;
  employee_count_confidence: LeadGenConfidence | null;
  social_assessment: LeadGenSocialAssessment | null;
  ad_running: boolean;
  lead_score: number;
  lead_score_breakdown: string | null;
  lead_temperature: LeadGenTemperature;
  lead_status: LeadGenStatus;
  call_attempts_count: number;
  last_call_at: string | null;
  next_call_at: string | null;
  best_call_window: string | null;
  do_not_call: boolean;
  do_not_call_reason: string | null;
  do_not_call_at: string | null;
  seed_source: LeadGenSeedSource | null;
  seed_source_note: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  last_verified_at: string | null;
}

const COMPANY_SELECT = `
  SELECT id, company_name, tax_number, company_registration_number, company_type,
         address, city, county, industry, main_activity,
         website, website_status, website_mobile_friendly, website_title,
         phone_main, phone_source, phone_type, phone_verified,
         revenue_current, revenue_previous, revenue_year, revenue_source, revenue_source_url,
         revenue_verified, revenue_verified_at,
         employee_count, employee_count_confidence,
         social_assessment, ad_running,
         lead_score, lead_score_breakdown, lead_temperature, lead_status,
         call_attempts_count, last_call_at, next_call_at, best_call_window,
         do_not_call, do_not_call_reason, do_not_call_at,
         seed_source, seed_source_note,
         created_by, created_at, updated_at, last_verified_at
  FROM leadgen_companies
`;

export interface ListLeadGenCompaniesFilter {
  status?: LeadGenStatus;
  search?: string;
  doNotCall?: boolean;
}

export async function listLeadGenCompanies(filter: ListLeadGenCompaniesFilter = {}): Promise<LeadGenCompanyRow[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filter.status) {
    params.push(filter.status);
    conditions.push(`lead_status = $${params.length}`);
  }
  if (filter.doNotCall != null) {
    params.push(filter.doNotCall);
    conditions.push(`do_not_call = $${params.length}`);
  }
  if (filter.search) {
    params.push(`%${filter.search}%`);
    conditions.push(`(company_name ILIKE $${params.length} OR tax_number ILIKE $${params.length})`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const { rows } = await pool.query<LeadGenCompanyRow>(
    `${COMPANY_SELECT} ${where} ORDER BY lead_score DESC, company_name ASC`,
    params
  );
  return rows;
}

export async function getLeadGenCompanyById(id: number): Promise<LeadGenCompanyRow | undefined> {
  const { rows } = await pool.query<LeadGenCompanyRow>(`${COMPANY_SELECT} WHERE id = $1`, [id]);
  return rows[0];
}

// Deduplikáció: elsődlegesen adószám, majd normalizált cégnév egyezés. A
// normalizálás teljes egészében SQL-ben történik (mindkét oldalon
// ugyanazzal a kifejezéssel), hogy sose térhessen el egy esetleges
// JS-oldali normalizálástól — csak a nyers cégnevet adjuk át.
export async function findDuplicateLeadGenCompany(
  taxNumber: string | null,
  companyName: string
): Promise<LeadGenCompanyRow | undefined> {
  if (taxNumber) {
    const { rows } = await pool.query<LeadGenCompanyRow>(`${COMPANY_SELECT} WHERE tax_number = $1`, [taxNumber]);
    if (rows[0]) return rows[0];
  }
  const { rows } = await pool.query<LeadGenCompanyRow>(
    `${COMPANY_SELECT}
     WHERE regexp_replace(lower(translate(company_name, 'áéíóöőúüű', 'aeiooouuu')), '[^a-z0-9]', '', 'g')
         = regexp_replace(lower(translate($1, 'áéíóöőúüű', 'aeiooouuu')), '[^a-z0-9]', '', 'g')`,
    [companyName]
  );
  return rows[0];
}

export interface CreateLeadGenCompanyInput {
  companyName: string;
  taxNumber?: string;
  companyRegistrationNumber?: string;
  companyType?: string;
  address?: string;
  city?: string;
  county?: string;
  industry?: string;
  mainActivity?: string;
  website?: string;
  phoneMain?: string;
  phoneSource?: string;
  phoneType?: LeadGenPhoneType;
  revenueCurrent?: number;
  revenuePrevious?: number;
  revenueYear?: number;
  revenueSource?: string;
  revenueSourceUrl?: string;
  employeeCount?: number;
  employeeCountConfidence?: LeadGenConfidence;
  socialAssessment?: LeadGenSocialAssessment;
  adRunning?: boolean;
  seedSource?: LeadGenSeedSource;
  seedSourceNote?: string;
  createdBy: number;
}

export async function createLeadGenCompany(input: CreateLeadGenCompanyInput): Promise<LeadGenCompanyRow> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO leadgen_companies
       (company_name, tax_number, company_registration_number, company_type,
        address, city, county, industry, main_activity, website,
        phone_main, phone_source, phone_type,
        revenue_current, revenue_previous, revenue_year, revenue_source, revenue_source_url,
        revenue_verified,
        employee_count, employee_count_confidence,
        social_assessment, ad_running,
        seed_source, seed_source_note, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
     RETURNING id`,
    [
      input.companyName,
      input.taxNumber ?? null,
      input.companyRegistrationNumber ?? null,
      input.companyType ?? null,
      input.address ?? null,
      input.city ?? null,
      input.county ?? null,
      input.industry ?? null,
      input.mainActivity ?? null,
      input.website ?? null,
      input.phoneMain ?? null,
      input.phoneSource ?? null,
      input.phoneType ?? null,
      input.revenueCurrent ?? null,
      input.revenuePrevious ?? null,
      input.revenueYear ?? null,
      input.revenueSource ?? null,
      input.revenueSourceUrl ?? null,
      Boolean(input.revenueSource),
      input.employeeCount ?? null,
      input.employeeCountConfidence ?? null,
      input.socialAssessment ?? null,
      input.adRunning ?? false,
      input.seedSource ?? "manual",
      input.seedSourceNote ?? null,
      input.createdBy,
    ]
  );
  const created = await getLeadGenCompanyById(rows[0].id);
  return created!;
}

export interface UpdateLeadGenCompanyInput {
  companyName: string;
  taxNumber?: string;
  companyRegistrationNumber?: string;
  companyType?: string;
  address?: string;
  city?: string;
  county?: string;
  industry?: string;
  mainActivity?: string;
  website?: string;
  phoneMain?: string;
  phoneSource?: string;
  phoneType?: LeadGenPhoneType;
  revenueCurrent?: number;
  revenuePrevious?: number;
  revenueYear?: number;
  revenueSource?: string;
  revenueSourceUrl?: string;
  employeeCount?: number;
  employeeCountConfidence?: LeadGenConfidence;
  socialAssessment?: LeadGenSocialAssessment;
  adRunning?: boolean;
}

export async function updateLeadGenCompany(
  id: number,
  input: UpdateLeadGenCompanyInput
): Promise<LeadGenCompanyRow | undefined> {
  const { rowCount } = await pool.query(
    `UPDATE leadgen_companies SET
       company_name = $2, tax_number = $3, company_registration_number = $4, company_type = $5,
       address = $6, city = $7, county = $8, industry = $9, main_activity = $10, website = $11,
       phone_main = $12, phone_source = $13, phone_type = $14,
       revenue_current = $15, revenue_previous = $16, revenue_year = $17,
       revenue_source = $18, revenue_source_url = $19, revenue_verified = $20,
       employee_count = $21, employee_count_confidence = $22,
       social_assessment = $23, ad_running = $24,
       updated_at = now()
     WHERE id = $1`,
    [
      id,
      input.companyName,
      input.taxNumber ?? null,
      input.companyRegistrationNumber ?? null,
      input.companyType ?? null,
      input.address ?? null,
      input.city ?? null,
      input.county ?? null,
      input.industry ?? null,
      input.mainActivity ?? null,
      input.website ?? null,
      input.phoneMain ?? null,
      input.phoneSource ?? null,
      input.phoneType ?? null,
      input.revenueCurrent ?? null,
      input.revenuePrevious ?? null,
      input.revenueYear ?? null,
      input.revenueSource ?? null,
      input.revenueSourceUrl ?? null,
      Boolean(input.revenueSource),
      input.employeeCount ?? null,
      input.employeeCountConfidence ?? null,
      input.socialAssessment ?? null,
      input.adRunning ?? false,
    ]
  );
  if (!rowCount) return undefined;
  return getLeadGenCompanyById(id);
}

export async function setLeadGenCompanyScore(
  id: number,
  score: number,
  breakdown: string,
  temperature: LeadGenTemperature
): Promise<void> {
  await pool.query(
    `UPDATE leadgen_companies SET lead_score = $2, lead_score_breakdown = $3, lead_temperature = $4 WHERE id = $1`,
    [id, score, breakdown, temperature]
  );
}

export interface WebsiteAuditResult {
  websiteStatus: string;
  websiteMobileFriendly: boolean | null;
  websiteTitle: string | null;
  phoneMain?: string | null;
  phoneSource?: string | null;
}

export async function setLeadGenCompanyAudit(id: number, audit: WebsiteAuditResult): Promise<void> {
  if (audit.phoneMain) {
    await pool.query(
      `UPDATE leadgen_companies SET
         website_status = $2, website_mobile_friendly = $3, website_title = $4,
         phone_main = COALESCE(phone_main, $5), phone_source = COALESCE(phone_source, $6),
         last_verified_at = now(), updated_at = now()
       WHERE id = $1`,
      [id, audit.websiteStatus, audit.websiteMobileFriendly, audit.websiteTitle, audit.phoneMain, audit.phoneSource]
    );
  } else {
    await pool.query(
      `UPDATE leadgen_companies SET
         website_status = $2, website_mobile_friendly = $3, website_title = $4,
         last_verified_at = now(), updated_at = now()
       WHERE id = $1`,
      [id, audit.websiteStatus, audit.websiteMobileFriendly, audit.websiteTitle]
    );
  }
}

export interface ApplyCallAttemptEffects {
  leadStatus?: LeadGenStatus;
  nextCallAt?: string | null;
  doNotCall?: boolean;
  doNotCallReason?: string;
}

export async function applyCallAttemptEffects(id: number, effects: ApplyCallAttemptEffects): Promise<void> {
  await pool.query(
    `UPDATE leadgen_companies SET
       call_attempts_count = call_attempts_count + 1,
       last_call_at = now(),
       next_call_at = $2,
       lead_status = COALESCE($3, lead_status),
       do_not_call = COALESCE($4, do_not_call),
       do_not_call_reason = COALESCE($5, do_not_call_reason),
       do_not_call_at = CASE WHEN $4 = true THEN now() ELSE do_not_call_at END,
       updated_at = now()
     WHERE id = $1`,
    [id, effects.nextCallAt ?? null, effects.leadStatus ?? null, effects.doNotCall ?? null, effects.doNotCallReason ?? null]
  );
}

// A "Mai hívólista" prioritási sorrendje (specifikáció 10. pont):
// 1. akinek visszahívást ígértünk és ma esedékes — ez szent
// 2. akivel meleg nyomon vagyunk (kapuőr átengedett / döntéshozó nem volt bent), esedékes
// 3. HOT leadek, még egy kísérlet sem volt rajtuk
// 4. nem vette fel / foglalt volt, esedékes újrahívás
// 5. WARM leadek
// A last_call CTE az utolsó diszpozíciót adja meg cégenként (ugyanaz a
// LATERAL/DISTINCT ON minta, mint a content_items "utolsó szereplő"
// lekérdezésénél).
export async function listLeadGenCallQueue(limit: number): Promise<LeadGenCompanyRow[]> {
  const { rows } = await pool.query<LeadGenCompanyRow>(
    `WITH last_call AS (
       SELECT DISTINCT ON (company_id) company_id, disposition
       FROM leadgen_call_attempts
       ORDER BY company_id, called_at DESC
     ),
     ranked AS (
       SELECT c.id AS ranked_company_id,
         CASE
           WHEN c.lead_status = 'callback' AND c.next_call_at <= now() THEN 1
           WHEN lc.disposition IN ('gatekeeper_passed', 'dm_unavailable')
                AND (c.next_call_at IS NULL OR c.next_call_at <= now()) THEN 2
           WHEN c.lead_temperature = 'hot' AND c.call_attempts_count = 0 THEN 3
           WHEN lc.disposition IN ('no_answer', 'busy') AND c.next_call_at <= now() THEN 4
           WHEN c.lead_temperature = 'warm' THEN 5
           ELSE 9
         END AS priority
       FROM leadgen_companies c
       LEFT JOIN last_call lc ON lc.company_id = c.id
       WHERE c.do_not_call = false
         AND c.lead_status NOT IN ('won', 'lost')
         AND c.phone_main IS NOT NULL
         AND c.call_attempts_count < 5
     )
     ${COMPANY_SELECT}
     JOIN ranked r ON r.ranked_company_id = leadgen_companies.id
     WHERE r.priority < 9
     ORDER BY r.priority ASC, leadgen_companies.lead_score DESC
     LIMIT $1`,
    [limit]
  );
  return rows;
}

export async function deleteLeadGenCompany(id: number): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM leadgen_companies WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}
