import { authFetch } from "./api";

export interface Client {
  id: number;
  company_name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  lead_id: number | null;
  next_shoot_date: string | null;
  drive_folder_id: string | null;
  created_by: number | null;
  created_by_name: string | null;
  onboarding_completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientFormInput {
  companyName: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
}

export interface ClientsListResult {
  clients: Client[];
  hasAccess: boolean;
}

export async function listClients(token: string): Promise<ClientsListResult> {
  const res = await authFetch(token, "/clients");
  return res.json();
}

export async function createClient(token: string, input: ClientFormInput): Promise<Client> {
  const res = await authFetch(token, "/clients", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  return data.client;
}

export async function updateClient(token: string, id: number, input: ClientFormInput): Promise<Client> {
  const res = await authFetch(token, `/clients/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  return data.client;
}

export async function deleteClient(token: string, id: number): Promise<void> {
  await authFetch(token, `/clients/${id}`, { method: "DELETE" });
}

export interface ClientAiProfile {
  client_id: number;
  brand_voice: string | null;
  target_audience: string | null;
  visual_direction: string | null;
  forbidden_topics: string | null;
  cta_style: string | null;
  platform_notes: string | null;
  reference_links: string | null;
  has_social_presence: boolean;
  inspiration_brands: string | null;
  brand_mission: string | null;
  content_goals: string | null;
  publishing_cadence: string | null;
  approval_process_notes: string | null;
  monthly_video_target: number | null;
  monthly_post_target: number | null;
  platform_facebook: boolean;
  platform_instagram: boolean;
  platform_tiktok: boolean;
  platform_youtube: boolean;
  website_url: string | null;
  onboarding_completed_at: string | null;
  updated_at: string;
}

export interface ClientAiProfileInput {
  brandVoice?: string;
  targetAudience?: string;
  visualDirection?: string;
  forbiddenTopics?: string;
  ctaStyle?: string;
  platformNotes?: string;
  referenceLinks?: string;
  hasSocialPresence?: boolean;
  inspirationBrands?: string;
  brandMission?: string;
  contentGoals?: string;
  publishingCadence?: string;
  approvalProcessNotes?: string;
  monthlyVideoTarget?: number;
  monthlyPostTarget?: number;
  platformFacebook?: boolean;
  platformInstagram?: boolean;
  platformTiktok?: boolean;
  platformYoutube?: boolean;
  websiteUrl?: string;
}

export async function getClientAiProfile(token: string, clientId: number): Promise<ClientAiProfile | null> {
  const res = await authFetch(token, `/clients/${clientId}/ai-profile`);
  const data = await res.json();
  return data.profile;
}

export async function updateClientAiProfile(
  token: string,
  clientId: number,
  input: ClientAiProfileInput
): Promise<ClientAiProfile> {
  const res = await authFetch(token, `/clients/${clientId}/ai-profile`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  return data.profile;
}
