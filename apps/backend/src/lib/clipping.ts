import { pool } from "../db/pool.js";
import { createClipContentItem, type Platform } from "../db/contentItems.js";
import { hasClippingBatch, markClippingBatch } from "../db/clippingBatches.js";

const LEAD_DAYS = 10;

interface ClippingClientRow {
  client_id: number;
  company_name: string;
  clipping_source_folder_url: string;
  monthly_video_target: number;
  platform_facebook: boolean;
  platform_instagram: boolean;
  platform_tiktok: boolean;
  platform_youtube: boolean;
}

function yearMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

const HU_MONTHS = [
  "január", "február", "március", "április", "május", "június",
  "július", "augusztus", "szeptember", "október", "november", "december",
];

// A klippek onnan mennek ki, amilyen platformokat az onboardingnál
// kijelöltek (nem külön "tartalom-gyártási" szolgáltatásként, hanem
// egyszerűen mint célfelület) — több platform esetén körbeforgatva
// osztjuk szét köztük, hogy egyik se maradjon ki. Ha semmi nincs
// kijelölve, Instagramra esik vissza (biztonsági alapérték).
function enabledPlatforms(client: ClippingClientRow): Platform[] {
  const platforms: Platform[] = [
    client.platform_facebook && "facebook",
    client.platform_instagram && "instagram",
    client.platform_tiktok && "tiktok",
    client.platform_youtube && "youtube",
  ].filter((p): p is Platform => Boolean(p));
  return platforms.length > 0 ? platforms : ["instagram"];
}

async function generateBatch(client: ClippingClientRow, targetMonth: Date): Promise<void> {
  const yearMonth = yearMonthKey(targetMonth);
  if (await hasClippingBatch(client.client_id, yearMonth)) return;

  const monthLabel = `${targetMonth.getFullYear()} ${HU_MONTHS[targetMonth.getMonth()]}`;
  const platforms = enabledPlatforms(client);

  for (let i = 1; i <= client.monthly_video_target; i++) {
    await createClipContentItem({
      clientId: client.client_id,
      title: `Clip ${monthLabel} #${i}`,
      platform: platforms[(i - 1) % platforms.length],
      rawMediaUrl: client.clipping_source_folder_url,
    });
  }
  await markClippingBatch(client.client_id, yearMonth);
}

async function listEligibleClients(): Promise<ClippingClientRow[]> {
  const { rows } = await pool.query<ClippingClientRow>(
    `SELECT c.id AS client_id, c.company_name,
            op.clipping_source_folder_url, op.monthly_video_target,
            op.platform_facebook, op.platform_instagram, op.platform_tiktok, op.platform_youtube
     FROM clients c
     JOIN client_onboarding_profiles op ON op.client_id = c.id
     WHERE op.service_clipping = true
       AND op.clipping_source_folder_url IS NOT NULL
       AND op.monthly_video_target IS NOT NULL
       AND op.monthly_video_target > 0`
  );
  return rows;
}

// Amint egy ügyfélnél Clippelés-t állítanak be onboardingkor (vagy utólag
// bekapcsolják), a folyó hónapra egyből létrejön a "Vágásra vár" köteg —
// nem kell megvárni a hónapváltást, hogy elkezdődhessen a munka. Best-
// effort, hívható közvetlenül az onboarding-mentés végén.
export async function ensureCurrentMonthClippingBatch(clientId: number): Promise<void> {
  const { rows } = await pool.query<ClippingClientRow>(
    `SELECT c.id AS client_id, c.company_name,
            op.clipping_source_folder_url, op.monthly_video_target,
            op.platform_facebook, op.platform_instagram, op.platform_tiktok, op.platform_youtube
     FROM clients c
     JOIN client_onboarding_profiles op ON op.client_id = c.id
     WHERE c.id = $1
       AND op.service_clipping = true
       AND op.clipping_source_folder_url IS NOT NULL
       AND op.monthly_video_target IS NOT NULL
       AND op.monthly_video_target > 0`,
    [clientId]
  );
  const client = rows[0];
  if (!client) return;
  await generateBatch(client, new Date());
}

// Naponta lefutó biztonsági háló: mindenkinek, akinél Clippelés van
// beállítva, biztosítja, hogy a FOLYÓ hónapra legyen köteg (arra az
// esetre, ha az onboarding-mentéskor futó azonnali generálás valamiért
// kimaradt) — plusz a hónapváltás előtt legfeljebb 10 nappal előre
// legenerálja a KÖVETKEZŐ hónap kötegét is, hogy egy nap csúszás se
// legyen a hónapváltáskor.
export async function processClippingBatches(): Promise<void> {
  const clients = await listEligibleClients();
  if (clients.length === 0) return;

  const today = new Date();
  const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const daysUntilNextMonth = Math.ceil((nextMonthStart.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));

  for (const client of clients) {
    await generateBatch(client, today);
    if (daysUntilNextMonth <= LEAD_DAYS) {
      await generateBatch(client, nextMonthStart);
    }
  }
}
