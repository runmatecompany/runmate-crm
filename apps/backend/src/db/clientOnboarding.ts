import { pool } from "./pool.js";

export interface ClientOnboardingRow {
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

export async function getClientOnboarding(clientId: number): Promise<ClientOnboardingRow | undefined> {
  const { rows } = await pool.query<ClientOnboardingRow>(
    `SELECT client_id, industry, business_description, website_url,
            facebook_url, instagram_url, tiktok_url, youtube_url, brand_assets_location,
            platform_facebook, platform_instagram, platform_tiktok, platform_youtube,
            service_website_build, service_landing_page, service_clipping, clipping_source_folder_url,
            monthly_video_target, monthly_post_target,
            collaboration_goals, approval_process_notes, approver_name, approver_email, other_notes,
            completed_at, updated_at
     FROM client_onboarding_profiles WHERE client_id = $1`,
    [clientId]
  );
  return rows[0];
}

export interface UpsertClientOnboardingInput {
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
  monthlyVideoTarget?: number;
  monthlyPostTarget?: number;
  collaborationGoals?: string;
  approvalProcessNotes?: string;
  approverName?: string;
  approverEmail?: string;
  otherNotes?: string;
}

// A completed_at az ELSŐ sikeres mentéskor áll be, és utólagos
// szerkesztéskor sem íródik felül (COALESCE) — ez jelzi az Ügyfelek
// listában, hogy az onboarding-kérdőívet valaha kitöltötték. A
// facebook_url/instagram_url/tiktok_url/youtube_url (meglévő jelenlét)
// nem szerepel itt — azt a lead-kutatásból vesszük át ügyféllé
// alakításkor (lásd db/leads.ts convertLeadToClient), a form csak
// referenciaként jeleníti meg, nem ez az upsert írja.
export async function upsertClientOnboarding(
  clientId: number,
  input: UpsertClientOnboardingInput
): Promise<ClientOnboardingRow> {
  await pool.query(
    `INSERT INTO client_onboarding_profiles
       (client_id, industry, business_description, website_url, brand_assets_location,
        platform_facebook, platform_instagram, platform_tiktok, platform_youtube,
        service_website_build, service_landing_page, service_clipping, clipping_source_folder_url,
        monthly_video_target, monthly_post_target,
        collaboration_goals, approval_process_notes, approver_name, approver_email, other_notes,
        completed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, now())
     ON CONFLICT (client_id) DO UPDATE SET
       industry = $2, business_description = $3, website_url = $4, brand_assets_location = $5,
       platform_facebook = $6, platform_instagram = $7, platform_tiktok = $8, platform_youtube = $9,
       service_website_build = $10, service_landing_page = $11, service_clipping = $12,
       clipping_source_folder_url = $13,
       monthly_video_target = $14, monthly_post_target = $15,
       collaboration_goals = $16, approval_process_notes = $17, approver_name = $18, approver_email = $19,
       other_notes = $20,
       completed_at = COALESCE(client_onboarding_profiles.completed_at, now()),
       updated_at = now()`,
    [
      clientId,
      input.industry ?? null,
      input.businessDescription ?? null,
      input.websiteUrl ?? null,
      input.brandAssetsLocation ?? null,
      input.platformFacebook ?? false,
      input.platformInstagram ?? false,
      input.platformTiktok ?? false,
      input.platformYoutube ?? false,
      input.serviceWebsiteBuild ?? false,
      input.serviceLandingPage ?? false,
      input.serviceClipping ?? false,
      input.clippingSourceFolderUrl ?? null,
      input.monthlyVideoTarget ?? null,
      input.monthlyPostTarget ?? null,
      input.collaborationGoals ?? null,
      input.approvalProcessNotes ?? null,
      input.approverName ?? null,
      input.approverEmail ?? null,
      input.otherNotes ?? null,
    ]
  );
  return (await getClientOnboarding(clientId))!;
}
