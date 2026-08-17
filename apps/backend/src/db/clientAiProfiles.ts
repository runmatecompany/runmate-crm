import { pool } from "./pool.js";

// Kreatív/tartalmi stílus-döntések — a "mit vállalunk nekik" és a
// vállalkozásról szóló tények a client_onboarding_profiles táblában
// vannak (lásd db/clientOnboarding.ts), külön kategóriaként.
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
  updated_at: string;
}

export async function getClientAiProfile(clientId: number): Promise<ClientAiProfileRow | undefined> {
  const { rows } = await pool.query<ClientAiProfileRow>(
    `SELECT client_id, brand_voice, target_audience, visual_direction, forbidden_topics,
            cta_style, platform_notes, reference_links, has_social_presence, inspiration_brands,
            brand_mission, updated_at
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
}

export async function upsertClientAiProfile(
  clientId: number,
  input: UpsertClientAiProfileInput
): Promise<ClientAiProfileRow> {
  await pool.query(
    `INSERT INTO client_ai_profiles
       (client_id, brand_voice, target_audience, visual_direction, forbidden_topics, cta_style, platform_notes,
        reference_links, has_social_presence, inspiration_brands, brand_mission)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (client_id) DO UPDATE SET
       brand_voice = $2, target_audience = $3, visual_direction = $4, forbidden_topics = $5,
       cta_style = $6, platform_notes = $7, reference_links = $8, has_social_presence = $9,
       inspiration_brands = $10, brand_mission = $11,
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
    ]
  );
  return (await getClientAiProfile(clientId))!;
}
