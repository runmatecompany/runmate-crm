import { authFetch } from "./api";

export type ClientStatus = "active" | "paused" | "closed";
export type ClientType = "monthly" | "one_off";

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
  monthly_video_target: number | null;
  monthly_post_target: number | null;
  service_clipping: boolean;
  service_short_videos: boolean;
  service_image_posts: boolean;
  service_website_build: boolean;
  service_landing_page: boolean;
  status: ClientStatus;
  client_type: ClientType | null;
  deletion_requested_by: number | null;
  deletion_requested_by_name: string | null;
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
  clientType?: ClientType;
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

export async function updateClientStatus(token: string, id: number, status: ClientStatus): Promise<Client> {
  const res = await authFetch(token, `/clients/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  const data = await res.json();
  return data.client;
}

// Nem-admin nem törölhet közvetlenül — ez egy kérelmet küld, ami
// feladatként jelenik meg az admin(ok)nak a Feladatok modulban.
export async function requestDeleteClient(token: string, id: number): Promise<Client> {
  const res = await authFetch(token, `/clients/${id}/deletion-request`, { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Nem sikerült elküldeni a törlési kérelmet");
  }
  const data = await res.json();
  return data.client;
}

export async function cancelDeletionRequest(token: string, id: number): Promise<Client> {
  const res = await authFetch(token, `/clients/${id}/deletion-request`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Nem sikerült visszavonni a törlési kérelmet");
  }
  const data = await res.json();
  return data.client;
}

// Kreatív/tartalmi stílus-döntések — a "mit vállalunk nekik" és a
// vállalkozásról szóló tények lib/clientOnboarding.ts-ben vannak, külön
// kategóriaként.
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
