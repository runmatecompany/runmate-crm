import { pool } from "./pool.js";

export interface ClientAiProfileRow {
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
  service_website_build: boolean;
  service_landing_page: boolean;
  service_clipping: boolean;
  clipping_source_folder_url: string | null;
  website_url: string | null;
  // Meglévő jelenlét linkjei — a lead-kutatásból kerülnek át ügyféllé
  // alakításkor (lásd db/leads.ts convertLeadToClient), a form nem
  // szerkeszthetőként jeleníti meg, csak referenciaként.
  facebook_url: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  youtube_url: string | null;
  onboarding_completed_at: string | null;
  updated_at: string;
}

export async function getClientAiProfile(clientId: number): Promise<ClientAiProfileRow | undefined> {
  const { rows } = await pool.query<ClientAiProfileRow>(
    `SELECT client_id, brand_voice, target_audience, visual_direction, forbidden_topics,
            cta_style, platform_notes, reference_links, has_social_presence, inspiration_brands,
            brand_mission, content_goals, publishing_cadence, approval_process_notes,
            monthly_video_target, monthly_post_target,
            platform_facebook, platform_instagram, platform_tiktok, platform_youtube,
            service_website_build, service_landing_page, service_clipping, clipping_source_folder_url, website_url,
            facebook_url, instagram_url, tiktok_url, youtube_url,
            onboarding_completed_at, updated_at
     FROM client_ai_profiles WHERE client_id = $1`,
    [clientId]
  );
  return rows[0];
}

export interface UpsertClientAiProfileInput {
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
  serviceWebsiteBuild?: boolean;
  serviceLandingPage?: boolean;
  serviceClipping?: boolean;
  clippingSourceFolderUrl?: string;
  websiteUrl?: string;
}

// Az onboarding_completed_at az ELSŐ sikeres mentéskor áll be, és utólagos
// szerkesztéskor sem íródik felül (COALESCE) — ez jelzi az Ügyfelek
// listában, hogy az onboarding-kérdőívet valaha kitöltötték, nem az utolsó
// módosítás időpontját.
export async function upsertClientAiProfile(
  clientId: number,
  input: UpsertClientAiProfileInput
): Promise<ClientAiProfileRow> {
  await pool.query(
    `INSERT INTO client_ai_profiles
       (client_id, brand_voice, target_audience, visual_direction, forbidden_topics, cta_style, platform_notes,
        reference_links, has_social_presence, inspiration_brands, brand_mission,
        content_goals, publishing_cadence, approval_process_notes,
        monthly_video_target, monthly_post_target,
        platform_facebook, platform_instagram, platform_tiktok, platform_youtube,
        service_website_build, service_landing_page, service_clipping, clipping_source_folder_url, website_url,
        onboarding_completed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, now())
     ON CONFLICT (client_id) DO UPDATE SET
       brand_voice = $2, target_audience = $3, visual_direction = $4, forbidden_topics = $5,
       cta_style = $6, platform_notes = $7, reference_links = $8, has_social_presence = $9,
       inspiration_brands = $10, brand_mission = $11,
       content_goals = $12, publishing_cadence = $13, approval_process_notes = $14,
       monthly_video_target = $15, monthly_post_target = $16,
       platform_facebook = $17, platform_instagram = $18, platform_tiktok = $19, platform_youtube = $20,
       service_website_build = $21, service_landing_page = $22, service_clipping = $23,
       clipping_source_folder_url = $24, website_url = $25,
       onboarding_completed_at = COALESCE(client_ai_profiles.onboarding_completed_at, now()),
       updated_at = now()`,
    [
      clientId,
      input.brandVoice ?? null,
      input.targetAudience ?? null,
      input.visualDirection ?? null,
      input.forbiddenTopics ?? null,
      input.ctaStyle ?? null,
      input.platformNotes ?? null,
      input.referenceLinks ?? null,
      input.hasSocialPresence ?? true,
      input.inspirationBrands ?? null,
      input.brandMission ?? null,
      input.contentGoals ?? null,
      input.publishingCadence ?? null,
      input.approvalProcessNotes ?? null,
      input.monthlyVideoTarget ?? null,
      input.monthlyPostTarget ?? null,
      input.platformFacebook ?? false,
      input.platformInstagram ?? false,
      input.platformTiktok ?? false,
      input.platformYoutube ?? false,
      input.serviceWebsiteBuild ?? false,
      input.serviceLandingPage ?? false,
      input.serviceClipping ?? false,
      input.clippingSourceFolderUrl ?? null,
      input.websiteUrl ?? null,
    ]
  );
  return (await getClientAiProfile(clientId))!;
}
