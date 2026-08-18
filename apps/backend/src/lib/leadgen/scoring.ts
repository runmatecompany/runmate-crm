import { getLeadGenCompanyById, setLeadGenCompanyScore, type LeadGenCompanyRow, type LeadGenTemperature } from "../../db/leadgenCompanies.js";
import { listLeadGenContacts } from "../../db/leadgenContacts.js";

// A telefonos hívólistára szánt pontozás — lásd a specifikáció 6. pontját.
// Phase 1-ben csak azokat a kategóriákat számoljuk automatikusan, amikhez
// van adatforrásunk; a marketing-aktivitás (Meta Ad Library) és az
// automata social-discovery Phase 2 — addig kézzel megadott
// social_assessment/ad_running mezőkből számolunk, ami már ma is működik.

export interface LeadScoreResult {
  score: number;
  temperature: LeadGenTemperature;
  breakdown: string;
}

function financialFit(revenueCurrent: number | null, revenueVerified: boolean): [number, string] {
  if (!revenueVerified || revenueCurrent == null) return [0, "Pénzügyi illeszkedés: 0 pont (nincs ellenőrzött árbevétel-adat)"];
  const r = revenueCurrent;
  if (r >= 500_000_000) return [25, `Pénzügyi illeszkedés: 25 pont (árbevétel ${Math.round(r / 1_000_000)} M Ft, 500 M–1 Mrd Ft sáv)`];
  if (r >= 1_000_000_000) return [20, `Pénzügyi illeszkedés: 20 pont (árbevétel 1 Mrd Ft felett — nagyobb szervezet, hosszabb döntési folyamat)`];
  if (r >= 300_000_000) return [20, `Pénzügyi illeszkedés: 20 pont (árbevétel ${Math.round(r / 1_000_000)} M Ft, 300–500 M Ft sáv)`];
  if (r >= 180_000_000) return [15, `Pénzügyi illeszkedés: 15 pont (árbevétel ${Math.round(r / 1_000_000)} M Ft, 180–300 M Ft sáv)`];
  if (r >= 120_000_000) return [10, `Pénzügyi illeszkedés: 10 pont (árbevétel ${Math.round(r / 1_000_000)} M Ft, 120–180 M Ft sáv)`];
  return [0, `Pénzügyi illeszkedés: 0 pont (árbevétel ${Math.round(r / 1_000_000)} M Ft, 100 M Ft alatt)`];
}

function phoneReachability(
  phoneMain: string | null,
  phoneType: string | null,
  hasKnownDecisionMaker: boolean
): [number, string] {
  if (!phoneMain) return [0, "Telefonos elérhetőség: 0 pont (nincs telefonszám)"];
  if (phoneType === "direct_dm") return [15, "Telefonos elérhetőség: 15 pont (közvetlen döntéshozói szám)"];
  if (phoneType === "central" && hasKnownDecisionMaker) {
    return [10, "Telefonos elérhetőség: 10 pont (központi szám, de ismert a döntéshozó)"];
  }
  if (phoneType === "central") return [6, "Telefonos elérhetőség: 6 pont (csak központi szám)"];
  if (phoneType === "contact_form") return [2, "Telefonos elérhetőség: 2 pont (csak általános kontaktűrlap)"];
  return [6, "Telefonos elérhetőség: 6 pont (van telefonszám, típusa nincs megadva)"];
}

function websiteOpportunity(websiteStatus: string | null): [number, string] {
  switch (websiteStatus) {
    case "very_good":
      return [0, "Weboldal-lehetőség: 0 pont (nagyon jó weboldal)"];
    case "average":
      return [5, "Weboldal-lehetőség: 5 pont (átlagos weboldal)"];
    case "outdated":
      return [10, "Weboldal-lehetőség: 10 pont (elavult weboldal)"];
    case "poor":
      return [15, "Weboldal-lehetőség: 15 pont (látványosan gyenge weboldal)"];
    case "none":
      return [20, "Weboldal-lehetőség: 20 pont (nem működik / nincs weboldal)"];
    default:
      return [0, "Weboldal-lehetőség: 0 pont (nincs még audit)"];
  }
}

function socialOpportunity(assessment: string | null): [number, string] {
  switch (assessment) {
    case "active_good":
      return [0, "Social lehetőség: 0 pont (aktív és profi)"];
    case "active_weak":
      return [5, "Social lehetőség: 5 pont (aktív, de gyenge)"];
    case "stale":
      return [8, "Social lehetőség: 8 pont (ritkán frissül)"];
    case "very_weak":
      return [12, "Social lehetőség: 12 pont (nagyon gyenge)"];
    case "none":
      return [15, "Social lehetőség: 15 pont (nincs jelenlét)"];
    default:
      return [0, "Social lehetőség: 0 pont (nincs felmérve)"];
  }
}

function marketingActivity(adRunning: boolean): [number, string] {
  if (adRunning) return [15, "Marketing-aktivitás: 15 pont (fut Meta/Google hirdetés — már költ marketingre)"];
  return [0, "Marketing-aktivitás: 0 pont (nem ismert aktív hirdetés)"];
}

function decisionMakerIdentifiability(hasOwner: boolean, hasMarketingContact: boolean): [number, string] {
  let points = 0;
  const parts: string[] = [];
  if (hasOwner) {
    points += 6;
    parts.push("ügyvezető neve ismert (+6)");
  }
  if (hasMarketingContact) {
    points += 4;
    parts.push("marketingért felelős személy ismert (+4)");
  }
  if (parts.length === 0) parts.push("nincs ismert döntéshozó");
  return [points, `Döntéshozó azonosíthatósága: ${points} pont (${parts.join(", ")})`];
}

function dataQuality(company: LeadGenCompanyRow): [number, string] {
  let points = 0;
  if (company.revenue_verified) points += 1;
  if (company.phone_verified) points += 1;
  if (company.website_status) points += 1;
  if (company.employee_count != null) points += 1;
  points = Math.min(points, 5);
  return [points, `Adatminőség: ${points} pont (ellenőrzött adatok száma alapján)`];
}

function temperatureFor(score: number): LeadGenTemperature {
  if (score >= 80) return "hot";
  if (score >= 60) return "warm";
  if (score >= 40) return "potential";
  return "low_priority";
}

export function computeLeadScore(
  company: LeadGenCompanyRow,
  contactFlags: { hasOwnerContact: boolean; hasMarketingContact: boolean }
): LeadScoreResult {
  const parts: [number, string][] = [
    financialFit(company.revenue_current != null ? Number(company.revenue_current) : null, company.revenue_verified),
    phoneReachability(company.phone_main, company.phone_type, contactFlags.hasOwnerContact),
    websiteOpportunity(company.website_status),
    socialOpportunity(company.social_assessment),
    marketingActivity(company.ad_running),
    decisionMakerIdentifiability(contactFlags.hasOwnerContact, contactFlags.hasMarketingContact),
    dataQuality(company),
  ];

  const score = parts.reduce((sum, [points]) => sum + points, 0);
  const breakdown = parts.map(([, label]) => label).join("\n");
  return { score, temperature: temperatureFor(score), breakdown };
}

// Bármikor, amikor egy cég olyan adata változik, ami a pontozásba beleszámít
// (cégadat szerkesztés, weboldal-audit, kontakt hozzáadása), újra kell
// számolni a pontszámot — ez a közös belépési pont mindhárom helyről.
export async function rescoreLeadGenCompany(id: number): Promise<void> {
  const company = await getLeadGenCompanyById(id);
  if (!company) return;
  const contacts = await listLeadGenContacts(id);
  const hasOwnerContact = contacts.some((c) => c.role_type === "owner" || c.role_type === "ceo");
  const hasMarketingContact = contacts.some((c) => c.role_type === "marketing");
  const result = computeLeadScore(company, { hasOwnerContact, hasMarketingContact });
  await setLeadGenCompanyScore(id, result.score, result.breakdown, result.temperature);
}
