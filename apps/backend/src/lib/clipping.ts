import { pool } from "../db/pool.js";
import { createClipContentItem } from "../db/contentItems.js";
import { hasClippingBatch, markClippingBatch } from "../db/clippingBatches.js";

const LEAD_DAYS = 10;

interface ClippingClientRow {
  client_id: number;
  company_name: string;
  clipping_source_folder_url: string;
  monthly_video_target: number;
}

function yearMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

const HU_MONTHS = [
  "január", "február", "március", "április", "május", "június",
  "július", "augusztus", "szeptember", "október", "november", "december",
];

// Havonta legfeljebb egyszer, a hónap vége előtt legfeljebb 10 nappal
// előre legenerálja a Clippelés-szolgáltatású ügyfelek következő havi
// "Vágásra vár" kötegét — így az ügyfélnek/vágónak mindig van ideje
// felkészülni, egy nap csúszás sincs a hónapváltáskor. A tartalom
// payment_confirmed=false-szal jön létre — a munka csak admin jóváhagyása
// (fizetés beérkezése) után indítható, lásd routes/contentItems.ts.
export async function processClippingBatches(): Promise<void> {
  const today = new Date();
  const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const daysUntilNextMonth = Math.ceil((nextMonthStart.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  if (daysUntilNextMonth > LEAD_DAYS) return;

  const targetMonth = nextMonthStart;
  const yearMonth = yearMonthKey(targetMonth);
  const monthLabel = `${targetMonth.getFullYear()} ${HU_MONTHS[targetMonth.getMonth()]}`;

  const { rows } = await pool.query<ClippingClientRow>(
    `SELECT c.id AS client_id, c.company_name,
            op.clipping_source_folder_url, op.monthly_video_target
     FROM clients c
     JOIN client_onboarding_profiles op ON op.client_id = c.id
     WHERE op.service_clipping = true
       AND op.clipping_source_folder_url IS NOT NULL
       AND op.monthly_video_target IS NOT NULL
       AND op.monthly_video_target > 0`
  );

  for (const row of rows) {
    if (await hasClippingBatch(row.client_id, yearMonth)) continue;

    for (let i = 1; i <= row.monthly_video_target; i++) {
      await createClipContentItem({
        clientId: row.client_id,
        title: `Clip ${monthLabel} #${i}`,
        platform: "instagram",
        rawMediaUrl: row.clipping_source_folder_url,
      });
    }
    await markClippingBatch(row.client_id, yearMonth);
  }
}
