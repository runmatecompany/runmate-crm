import { claimNextPendingResearch, setLeadResearchAwaitingInput, setLeadResearchDone, setLeadResearchError } from "../../db/leadResearch.js";
import { getLeadById } from "../../db/leads.js";
import { checkWebsite } from "./website.js";
import { synthesizeCallMaterials } from "./synthesize.js";

// A server.ts-ben lévő ütemezett ciklus hívja periodikusan (ugyanaz a minta,
// mint a Google Calendar szinkron) — egyszerre legfeljebb egy 'pending'
// kutatást dolgoz fel, nincs konkurens worker.
//
// B fázis: weboldal esetén csak az elérhetőséget ellenőrzi (API-kulcs
// nélkül). Weboldal hiányában nincs automatizált keresés — sem a Google
// Custom Search API, sem a Gemini "Google Search grounding" eszköze nem
// érhető el fizetés (számlázás bekötése) nélkül, próbáltuk mindkettőt élőben.
// Ilyenkor egyértelmű üzenet jelzi, hogy kézi kutatás szükséges.
//
// D fázis: a kézi jegyzet beküldése (routes/leadResearch.ts) a sort újra
// 'pending'-re teszi, social_manual_notes kitöltve — ez a jel, hogy nem egy
// friss kutatásról van szó, hanem a hook/script/audit szintézis vár rá.
export async function processNextLeadResearch(): Promise<void> {
  const research = await claimNextPendingResearch();
  if (!research) return;

  const lead = await getLeadById(research.lead_id);
  if (!lead) {
    await setLeadResearchError(research.id, "A lead már nem található");
    return;
  }

  if (research.social_manual_notes !== null) {
    try {
      const result = await synthesizeCallMaterials({
        companyName: lead.company_name,
        contactName: lead.contact_name,
        websiteAnalysis: research.website_analysis,
        socialManualNotes: research.social_manual_notes,
      });
      await setLeadResearchDone(research.id, result);
    } catch (err) {
      await setLeadResearchError(
        research.id,
        err instanceof Error ? err.message : "Ismeretlen hiba a hívás-anyagok generálása közben"
      );
    }
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
