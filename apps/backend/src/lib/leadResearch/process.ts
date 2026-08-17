import { claimNextPendingResearch, setLeadResearchAwaitingInput, setLeadResearchError } from "../../db/leadResearch.js";
import { getLeadById } from "../../db/leads.js";
import { checkWebsite } from "./website.js";

// A server.ts-ben lévő ütemezett ciklus hívja periodikusan (ugyanaz a minta,
// mint a Google Calendar szinkron) — egyszerre legfeljebb egy 'pending'
// kutatást dolgoz fel, nincs konkurens worker.
//
// Weboldal esetén csak az elérhetőséget ellenőrzi (API-kulcs nélkül).
// Weboldal hiányában nincs automatizált keresés — sem a Google Custom
// Search API, sem a Gemini "Google Search grounding" eszköze nem érhető el
// fizetés (számlázás bekötése) nélkül, próbáltuk mindkettőt élőben.
// A kézi kutatás a leadek saját kérdőívén történik (lásd routes/leads.ts,
// facebook_url/instagram_url/tiktok_url/youtube_url mezők), nem itt — a
// korábbi AI hook/script/audit szintézis funkciót a felhasználó kérésére
// eltávolítottuk.
export async function processNextLeadResearch(): Promise<void> {
  const research = await claimNextPendingResearch();
  if (!research) return;

  const lead = await getLeadById(research.lead_id);
  if (!lead) {
    await setLeadResearchError(research.id, "A lead már nem található");
    return;
  }

  if (!lead.website_url) {
    await setLeadResearchAwaitingInput(
      research.id,
      "Nincs megadva weboldal-cím ehhez a leadhez — kézi kutatás szükséges (pl. Google/Facebook/Instagram/LinkedIn)."
    );
    return;
  }

  try {
    const analysis = await checkWebsite(lead.website_url);
    await setLeadResearchAwaitingInput(research.id, analysis);
  } catch (err) {
    await setLeadResearchError(
      research.id,
      err instanceof Error ? err.message : "Ismeretlen hiba a weboldal-ellenőrzés közben"
    );
  }
}
