import { claimNextPendingResearch, setLeadResearchAwaitingInput, setLeadResearchError } from "../../db/leadResearch.js";
import { getLeadById } from "../../db/leads.js";
import { checkWebsite } from "./website.js";

// A server.ts-ben lévő ütemezett ciklus hívja periodikusan (ugyanaz a minta,
// mint a Google Calendar szinkron) — egyszerre legfeljebb egy 'pending'
// kutatást dolgoz fel, nincs konkurens worker.
//
// B fázis: csak a weboldal-elérhetőséget ellenőrzi (API-kulcs nélkül), és
// 'awaiting_input'-ra állítja — a kézi social-form + AI-szintézis (a 'done'
// állapot) a D fázisban kerül ide. A C fázisban ez bővül PageSpeed/YouTube/
// Custom Search hívásokkal.
export async function processNextLeadResearch(): Promise<void> {
  const research = await claimNextPendingResearch();
  if (!research) return;

  const lead = await getLeadById(research.lead_id);
  if (!lead) {
    await setLeadResearchError(research.id, "A lead már nem található");
    return;
  }

  if (!lead.website_url) {
    await setLeadResearchAwaitingInput(research.id, "Nincs megadva weboldal-cím ehhez a leadhez.");
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
