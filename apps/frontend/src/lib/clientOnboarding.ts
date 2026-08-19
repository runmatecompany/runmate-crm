import { authFetch } from "./api";

// A vállalkozásról szóló tények és a szolgáltatás-terjedelem ("amit
// vállalunk nekik") — külön az AI-profiltól, ami a kreatív/tartalmi
// stílus-döntéseket tárolja (megszólítás, hangvétel, célközönség, brand
// színek). Ezt az onboarding-hívást lebonyolító kolléga tölti ki élőben.
// Minden szolgáltatás (Weboldal, Landing, Short videók, Képes posztok,
// Clippelés) önálló, csak akkor releváns kérdéscsoportot nyit meg az
// űrlapon — a platform-választás (Facebook/Instagram/TikTok/YouTube)
// szolgáltatásonként külön van, nem egy közös, felső szintű jelölő.
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
  // Az egykori felső szintű platform-jelölők — a szerver mostantól a
  // szolgáltatásonkénti platform-listák uniójaként számolja újra minden
  // mentéskor, ezt még a ContentItemFormModal.tsx olvassa a tartalom-
  // létrehozásnál felajánlott platformok szűréséhez.
  platform_facebook: boolean;
  platform_instagram: boolean;
  platform_tiktok: boolean;
  platform_youtube: boolean;
  service_website_build: boolean;
  service_landing_page: boolean;
  service_short_videos: boolean;
  service_image_posts: boolean;
  service_clipping: boolean;
  website_pages_count: number | null;
  website_domain_hosting: string | null;
  website_reference_notes: string | null;
  landing_goal: string | null;
  landing_domain_hosting: string | null;
  landing_reference_notes: string | null;
  short_videos_platforms: string | null;
  image_posts_platforms: string | null;
  clipping_platforms: string | null;
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
  serviceWebsiteBuild?: boolean;
  serviceLandingPage?: boolean;
  serviceShortVideos?: boolean;
  serviceImagePosts?: boolean;
  serviceClipping?: boolean;
  websitePagesCount?: number;
  websiteDomainHosting?: string;
  websiteReferenceNotes?: string;
  landingGoal?: string;
  landingDomainHosting?: string;
  landingReferenceNotes?: string;
  shortVideosPlatforms?: string[];
  imagePostsPlatforms?: string[];
  clippingPlatforms?: string[];
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

// A platform-lista mezők a DB-ben (a projekt "nincs jsonb/array oszlop"
// konvenciója miatt) soronkénti TEXT-ként tárolódnak — ez alakítja
// checkbox-listává és vissza.
export function splitPlatforms(text: string | null): string[] {
  return text ? text.split("\n").filter(Boolean) : [];
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
