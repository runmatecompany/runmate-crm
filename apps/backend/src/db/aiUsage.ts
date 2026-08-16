import { pool } from "./pool.js";

// Napi kemény felső korlát az összes AI-hívásra (Lead-kutató szintézis,
// Tervező AI-vázlat, lead-fotó AI-kitöltés együtt) — mindhárom ugyanazt a
// GEMINI_API_KEY-t és kvótát osztja. A tábla (nem memóriabeli számláló)
// azért kell, hogy szerver-újraindítás ne nullázza a napi számlálót.
const DAILY_LIMIT = 100;

// Atomi upsert: egy lépésben növeli a mai sort (vagy hozza létre 1-gyel),
// és visszaadja az új értéket — nincs race condition párhuzamos kérések közt.
export async function consumeAiQuota(): Promise<{ allowed: boolean; count: number; limit: number }> {
  const { rows } = await pool.query<{ request_count: number }>(
    `INSERT INTO ai_usage_daily (day, request_count) VALUES (CURRENT_DATE, 1)
     ON CONFLICT (day) DO UPDATE SET request_count = ai_usage_daily.request_count + 1
     RETURNING request_count`
  );
  const count = rows[0].request_count;
  return { allowed: count <= DAILY_LIMIT, count, limit: DAILY_LIMIT };
}

export async function assertAiQuotaAvailable(): Promise<void> {
  const { allowed, limit } = await consumeAiQuota();
  if (!allowed) {
    throw new Error(`Elérted a mai AI-hívási keretet (${limit}/nap) — próbáld újra holnap.`);
  }
}
