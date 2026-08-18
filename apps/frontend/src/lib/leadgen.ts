import { authFetch } from "./api";
import { getApiUrl } from "./serverConfig";

export type LeadGenPhoneType = "direct_dm" | "central" | "contact_form";
export type LeadGenConfidence = "high" | "medium" | "low";
export type LeadGenSocialAssessment = "active_good" | "active_weak" | "stale" | "very_weak" | "none";
export type LeadGenTemperature = "hot" | "warm" | "potential" | "low_priority";
export type LeadGenStatus =
  | "new" | "qualified" | "calling" | "callback" | "interested" | "meeting_booked" | "won" | "nurture" | "lost";
export type LeadGenSeedSource = "csv" | "maps" | "ad_library" | "catalog" | "manual";
export type LeadGenDisposition =
  | "no_answer" | "busy" | "wrong_number" | "gatekeeper_blocked" | "gatekeeper_passed"
  | "dm_unavailable" | "callback_requested" | "not_interested" | "interested"
  | "meeting_booked" | "do_not_call";

export const LEAD_STATUS_LABELS: Record<LeadGenStatus, string> = {
  new: "Új",
  qualified: "Minősített",
  calling: "Hívás alatt",
  callback: "Visszahívás",
  interested: "Érdeklődik",
  meeting_booked: "Meeting egyeztetve",
  won: "Nyert",
  nurture: "Nurture",
  lost: "Elveszett",
};

export const TEMPERATURE_LABELS: Record<LeadGenTemperature, string> = {
  hot: "HOT",
  warm: "WARM",
  potential: "POTENTIAL",
  low_priority: "LOW PRIORITY",
};

export const DISPOSITION_LABELS: Record<LeadGenDisposition, string> = {
  no_answer: "Nem vette fel",
  busy: "Foglalt",
  wrong_number: "Rossz szám",
  gatekeeper_blocked: "Kapuőr nem kapcsolt",
  gatekeeper_passed: "Kapuőr továbbkapcsolt",
  dm_unavailable: "Döntéshozó nincs bent",
  callback_requested: "Visszahívást kért",
  not_interested: "Nem érdekli",
  interested: "Érdeklődik",
  meeting_booked: "Meeting egyeztetve",
  do_not_call: "Ne hívjuk többet",
};

export interface LeadGenCompany {
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

export interface LeadGenContact {
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

export interface LeadGenCallAttempt {
  id: number;
  company_id: number;
  contact_id: number | null;
  called_at: string;
  called_by: number | null;
  called_by_name: string | null;
  disposition: LeadGenDisposition;
  gatekeeper_name: string | null;
  reached_person: string | null;
  duration_seconds: number | null;
  notes: string | null;
  next_action: string | null;
  next_call_at: string | null;
  gdpr_notice_given: boolean;
}

export interface LeadGenCompanyInput {
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

export interface LeadGenContactInput {
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

export interface LeadGenCallAttemptInput {
  contactId?: number;
  disposition: LeadGenDisposition;
  gatekeeperName?: string;
  reachedPerson?: string;
  durationSeconds?: number;
  notes?: string;
  nextAction?: string;
  nextCallAt?: string;
  gdprNoticeGiven: boolean;
}

export async function listLeadGenCompanies(
  token: string,
  filter: { status?: LeadGenStatus; search?: string } = {}
): Promise<{ companies: LeadGenCompany[] }> {
  const params = new URLSearchParams();
  if (filter.status) params.set("status", filter.status);
  if (filter.search) params.set("search", filter.search);
  const qs = params.toString();
  const res = await authFetch(token, `/leadgen/companies${qs ? `?${qs}` : ""}`);
  return res.json();
}

export async function listLeadGenCallQueue(token: string, limit = 15): Promise<{ companies: LeadGenCompany[] }> {
  const res = await authFetch(token, `/leadgen/call-queue?limit=${limit}`);
  return res.json();
}

export async function listLeadGenDoNotCall(token: string): Promise<{ companies: LeadGenCompany[] }> {
  const res = await authFetch(token, `/leadgen/do-not-call`);
  return res.json();
}

export interface LeadGenCompanyDetail {
  company: LeadGenCompany;
  contacts: LeadGenContact[];
  callAttempts: LeadGenCallAttempt[];
  openingLine: string;
  whyInteresting: string[];
  bestContact: LeadGenContact | null;
}

export async function getLeadGenCompany(token: string, id: number): Promise<LeadGenCompanyDetail> {
  const res = await authFetch(token, `/leadgen/companies/${id}`);
  return res.json();
}

export async function createLeadGenCompany(token: string, input: LeadGenCompanyInput): Promise<LeadGenCompany> {
  const res = await authFetch(token, `/leadgen/companies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  return data.company;
}

export async function updateLeadGenCompany(
  token: string,
  id: number,
  input: LeadGenCompanyInput
): Promise<LeadGenCompany> {
  const res = await authFetch(token, `/leadgen/companies/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  return data.company;
}

export async function deleteLeadGenCompany(token: string, id: number): Promise<void> {
  await authFetch(token, `/leadgen/companies/${id}`, { method: "DELETE" });
}

export async function auditLeadGenCompanyWebsite(token: string, id: number): Promise<LeadGenCompany> {
  const res = await authFetch(token, `/leadgen/companies/${id}/audit`, { method: "POST" });
  const data = await res.json();
  return data.company;
}

export async function createLeadGenContact(
  token: string,
  companyId: number,
  input: LeadGenContactInput
): Promise<LeadGenContact> {
  const res = await authFetch(token, `/leadgen/companies/${companyId}/contacts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  return data.contact;
}

export async function deleteLeadGenContact(token: string, id: number): Promise<void> {
  await authFetch(token, `/leadgen/contacts/${id}`, { method: "DELETE" });
}

export async function createLeadGenCallAttempt(
  token: string,
  companyId: number,
  input: LeadGenCallAttemptInput
): Promise<{ attempt: LeadGenCallAttempt; company: LeadGenCompany }> {
  const res = await authFetch(token, `/leadgen/companies/${companyId}/call-attempts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return res.json();
}

export type LeadGenCsvField =
  | "companyName" | "taxNumber" | "website" | "phoneMain" | "address"
  | "city" | "county" | "industry" | "revenueCurrent" | "revenueYear";

export type LeadGenCsvMapping = Record<number, LeadGenCsvField | "">;

export interface LeadGenImportSummary {
  imported: number;
  skippedDuplicates: number;
  skippedMissingData: number;
  total: number;
}

export async function importLeadGenCsv(
  token: string,
  file: File,
  mapping: LeadGenCsvMapping
): Promise<LeadGenImportSummary> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("mapping", JSON.stringify(mapping));
  const res = await fetch(`${getApiUrl()}/leadgen/companies/import`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Nem sikerült importálni a CSV-t");
  }
  const data = await res.json();
  return data.summary;
}

export interface LeadGenSettings {
  interest_balancing_test_text: string | null;
  interest_balancing_test_version: number;
  interest_balancing_test_updated_at: string | null;
}

export async function getLeadGenSettings(token: string): Promise<LeadGenSettings> {
  const res = await authFetch(token, `/leadgen/settings`);
  const data = await res.json();
  return data.settings;
}

export async function updateLeadGenInterestBalancingTest(token: string, text: string): Promise<LeadGenSettings> {
  const res = await authFetch(token, `/leadgen/settings/interest-balancing-test`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const data = await res.json();
  return data.settings;
}
