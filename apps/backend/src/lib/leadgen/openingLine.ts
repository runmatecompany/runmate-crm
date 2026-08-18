import type { LeadGenCompanyRow } from "../../db/leadgenCompanies.js";

// Szigorú szabály: csak olyan tényre hivatkozhat, amit a rendszer
// ténylegesen ellenőrzött (lásd specifikáció 7. pont) — soha nem generál
// AI-t hívva, mert az kockázatos lenne kitalált állítás szempontjából.
// Sablon-alapú, csak FACT-tier mezőkből (nem INFERENCE, nem UNKNOWN).
export function buildOpeningLine(company: LeadGenCompanyRow, contactName: string | null): string {
  const greeting = contactName ? `Jó napot, ${contactName}t keresem.` : "Jó napot, az ügyvezetőt keresem.";
  const intro = "RunMate, weboldal- és social media szolgáltatásokkal foglalkozunk.";

  const observations: string[] = [];
  if (company.ad_running) {
    observations.push("Láttam, hogy jelenleg is fut hirdetésük");
  }
  if (company.website_status === "poor" || company.website_status === "none") {
    observations.push(
      company.website_status === "none"
        ? "a weboldaluk jelenleg nem elérhető"
        : "a weboldaluk mobilon nehezen használható"
    );
  } else if (company.website_status === "outdated") {
    observations.push("a weboldaluk kicsit elavultnak tűnik");
  }
  if (company.social_assessment === "none") {
    observations.push("nem találtam aktív közösségi médiás jelenlétet sem");
  } else if (company.social_assessment === "stale") {
    observations.push("a közösségi oldaluk egy ideje nem frissült");
  }

  let observationSentence = "";
  if (observations.length === 1) {
    observationSentence = `${observations[0].charAt(0).toUpperCase()}${observations[0].slice(1)}.`;
  } else if (observations.length > 1) {
    observationSentence = `${observations[0].charAt(0).toUpperCase()}${observations[0].slice(1)}, viszont ${observations[1]}.`;
  }

  const closing = "Van 2 perce erre?";
  return [greeting, intro, observationSentence, closing].filter(Boolean).join(" ");
}

// A hívókártya "Miért érdekes" listája — ugyanaz a FACT-only szabály, mint
// az első mondatnál, csak felsorolás formában, a hívó gyors tájékozódásához.
export function buildWhyInteresting(company: LeadGenCompanyRow): string[] {
  const points: string[] = [];

  if (company.revenue_verified && company.revenue_current != null) {
    const millions = Math.round(Number(company.revenue_current) / 1_000_000);
    points.push(`Árbevétel ${millions} M Ft (${company.revenue_year ?? "ismeretlen év"}, ${company.revenue_source ?? "ellenőrzött forrás"})`);
  }

  if (company.website_status === "poor") {
    points.push("Weboldal mobilon nehezen használható");
  } else if (company.website_status === "none") {
    points.push("A weboldal jelenleg nem elérhető");
  } else if (company.website_status === "outdated") {
    points.push("A weboldal elavultnak tűnik (nincs mobilra optimalizálva)");
  }

  if (company.social_assessment === "none") {
    points.push("Nincs aktív közösségi médiás jelenlét");
  } else if (company.social_assessment === "stale") {
    points.push("A közösségi oldaluk régóta nem frissült");
  } else if (company.social_assessment === "very_weak") {
    points.push("A közösségi jelenlétük nagyon gyenge");
  }

  if (company.ad_running) {
    points.push("⚡ FUT hirdetése — költ marketingre");
  }

  if (company.employee_count != null) {
    points.push(`Kb. ${company.employee_count} fős csapat`);
  }

  return points;
}
