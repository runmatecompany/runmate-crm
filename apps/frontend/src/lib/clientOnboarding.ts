import { authFetch } from "./api";

// A vállalkozásról szóló tények és a szolgáltatás-terjedelem ("amit
// vállalunk nekik") — külön az AI-profiltól, ami a kreatív/tartalmi
// stílus-döntéseket tárolja (megszólítás, hangvétel, célközönség, brand
// színek). Ezt az onboarding-hívást lebonyolító kolléga tölti ki élőben.
export interface ClientOnboarding {
  client_id: number;
  industry: string | null;
  business_description: string | null;
  website_url: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  youtube_url: string | null;
  brand_assets_location: string | null;
  platform_facebook: boolean;
  platform_instagram: boolean;
  platform_tiktok: boolean;
  platform_youtube: boolean;
  service_website_build: boolean;
  service_landing_page: boolean;
  service_clipping: boolean;
  clipping_source_folder_url: string | null;
  clipping_daily_target: number | null;
  monthly_video_target: number | null;
  monthly_post_target: number | null;
  collaboration_goals: string | null;
  approval_process_notes: string | null;
  approver_name: string | null;
  approver_email: string | null;
  other_notes: string | null;
  completed_at: string | null;
  updated_at: string;
}

export interface ClientOnboardingInput {
  industry?: string;
  businessDescription?: string;
  websiteUrl?: string;
  brandAssetsLocation?: string;
  platformFacebook?: boolean;
  platformInstagram?: boolean;
  platformTiktok?: boolean;
  platformYoutube?: boolean;
  serviceWebsiteBuild?: boolean;
  serviceLandingPage?: boolean;
  serviceClipping?: boolean;
  clippingSourceFolderUrl?: string;
  clippingDailyTarget?: number;
  monthlyVideoTarget?: number;
  monthlyPostTarget?: number;
  collaborationGoals?: string;
  approvalProcessNotes?: string;
  approverName?: string;
  approverEmail?: string;
  otherNotes?: string;
}

export async function getClientOnboarding(token: string, clientId: number): Promise<ClientOnboarding | null> {
  const res = await authFetch(token, `/clients/${clientId}/onboarding`);
  const data = await res.json();
  return data.profile;
}

export async function updateClientOnboarding(
  token: string,
  clientId: number,
  input: ClientOnboardingInput
): Promise<ClientOnboarding> {
  const res = await authFetch(token, `/clients/${clientId}/onboarding`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  return data.profile;
}
