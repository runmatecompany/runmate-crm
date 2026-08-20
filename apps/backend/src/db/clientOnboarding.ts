import { pool } from "./pool.js";
import { getClientById } from "./clients.js";
import { ensureWebProjectForService } from "./webProjects.js";

const PLATFORM_NAMES = ["Facebook", "Instagram", "TikTok", "YouTube"] as const;

function joinPlatforms(list?: string[]): string | null {
  if (!list || list.length === 0) return null;
  return list.join("\n");
}

// A platform_facebook/instagram/tiktok/youtube oszlopokat a
// ContentItemFormModal.tsx még olvassa (ott dönti el, mely platformokat
// ajánlja fel egy új tartalomhoz) — hogy ne kelljen azt is átírni, minden
// mentéskor újraszámoljuk őket a három új, szolgáltatásonkénti platform-
// lista uniójaként.
function unionHasPlatform(lists: string[][], name: string): boolean {
  return lists.some((list) => list.includes(name));
}

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

export async function getClientOnboarding(clientId: number): Promise<ClientOnboardingRow | undefined> {
  const { rows } = await pool.query<ClientOnboardingRow>(
    `SELECT client_id, industry, business_description, website_url,
            facebook_url, instagram_url, tiktok_url, youtube_url, brand_assets_location,
            platform_facebook, platform_instagram, platform_tiktok, platform_youtube,
            service_website_build, service_landing_page, service_short_videos, service_image_posts,
            service_clipping,
            website_pages_count, website_domain_hosting, website_reference_notes,
            landing_goal, landing_domain_hosting, landing_reference_notes,
            short_videos_platforms, image_posts_platforms, clipping_platforms,
            clipping_source_folder_url, clipping_daily_target,
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

// A completed_at az ELSŐ sikeres mentéskor áll be, és utólagos
// szerkesztéskor sem íródik felül (COALESCE) — ez jelzi az Ügyfelek
// listában, hogy az onboarding-kérdőívet valaha kitöltötték. A
// facebook_url/instagram_url/tiktok_url/youtube_url (meglévő jelenlét)
// nem szerepel itt — azt a lead-kutatásból vesszük át ügyféllé
// alakításkor (lásd db/leads.ts convertLeadToClient), a form csak
// referenciaként jeleníti meg, nem ez az upsert írja.
export async function upsertClientOnboarding(
  clientId: number,
  input: UpsertClientOnboardingInput,
  createdBy: number
): Promise<ClientOnboardingRow> {
  const shortVideosPlatforms = input.shortVideosPlatforms ?? [];
  const imagePostsPlatforms = input.imagePostsPlatforms ?? [];
  const clippingPlatforms = input.clippingPlatforms ?? [];
  const allPlatformLists = [shortVideosPlatforms, imagePostsPlatforms, clippingPlatforms];
  const [platformFacebook, platformInstagram, platformTiktok, platformYoutube] = PLATFORM_NAMES.map((name) =>
    unionHasPlatform(allPlatformLists, name)
  );

  await pool.query(
    `INSERT INTO client_onboarding_profiles
       (client_id, industry, business_description, website_url, brand_assets_location,
        platform_facebook, platform_instagram, platform_tiktok, platform_youtube,
        service_website_build, service_landing_page, service_short_videos, service_image_posts,
        service_clipping,
        website_pages_count, website_domain_hosting, website_reference_notes,
        landing_goal, landing_domain_hosting, landing_reference_notes,
        short_videos_platforms, image_posts_platforms, clipping_platforms,
        clipping_source_folder_url,
        clipping_daily_target, monthly_video_target, monthly_post_target,
        collaboration_goals, approval_process_notes, approver_name, approver_email, other_notes,
        completed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
             $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, now())
     ON CONFLICT (client_id) DO UPDATE SET
       industry = $2, business_description = $3, website_url = $4, brand_assets_location = $5,
       platform_facebook = $6, platform_instagram = $7, platform_tiktok = $8, platform_youtube = $9,
       service_website_build = $10, service_landing_page = $11, service_short_videos = $12,
       service_image_posts = $13, service_clipping = $14,
       website_pages_count = $15, website_domain_hosting = $16, website_reference_notes = $17,
       landing_goal = $18, landing_domain_hosting = $19, landing_reference_notes = $20,
       short_videos_platforms = $21, image_posts_platforms = $22, clipping_platforms = $23,
       clipping_source_folder_url = $24,
       clipping_daily_target = $25, monthly_video_target = $26, monthly_post_target = $27,
       collaboration_goals = $28, approval_process_notes = $29, approver_name = $30, approver_email = $31,
       other_notes = $32,
       completed_at = COALESCE(client_onboarding_profiles.completed_at, now()),
       updated_at = now()`,
    [
      clientId,
      input.industry ?? null,
      input.businessDescription ?? null,
      input.websiteUrl ?? null,
      input.brandAssetsLocation ?? null,
      platformFacebook,
      platformInstagram,
      platformTiktok,
      platformYoutube,
      input.serviceWebsiteBuild ?? false,
      input.serviceLandingPage ?? false,
      input.serviceShortVideos ?? false,
      input.serviceImagePosts ?? false,
      input.serviceClipping ?? false,
      input.websitePagesCount ?? null,
      input.websiteDomainHosting ?? null,
      input.websiteReferenceNotes ?? null,
      input.landingGoal ?? null,
      input.landingDomainHosting ?? null,
      input.landingReferenceNotes ?? null,
      joinPlatforms(shortVideosPlatforms),
      joinPlatforms(imagePostsPlatforms),
      joinPlatforms(clippingPlatforms),
      input.clippingSourceFolderUrl ?? null,
      input.clippingDailyTarget ?? null,
      input.monthlyVideoTarget ?? null,
      input.monthlyPostTarget ?? null,
      input.collaborationGoals ?? null,
      input.approvalProcessNotes ?? null,
      input.approverName ?? null,
      input.approverEmail ?? null,
      input.otherNotes ?? null,
    ]
  );

  // A Web modulban nincs kézi "+ Új projekt" — a projektek automatikusan
  // jönnek létre, amikor itt bejelölik a Weboldal/Landing szolgáltatást.
  if (input.serviceWebsiteBuild || input.serviceLandingPage) {
    const client = await getClientById(clientId);
    if (client) {
      if (input.serviceWebsiteBuild) {
        await ensureWebProjectForService(clientId, "website", client.company_name, createdBy);
      }
      if (input.serviceLandingPage) {
        await ensureWebProjectForService(clientId, "landing_page", client.company_name, createdBy);
      }
    }
  }

  return (await getClientOnboarding(clientId))!;
}
