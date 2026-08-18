// Egyszerű, függőség nélküli weboldal-audit — nincs headless böngésző
// (ugyanaz az elv, mint a Drive-integrációnál: sima HTTP-hívás, nem egy
// nehéz új csomag). A cél nem egy technikai riport, hanem egy hívásra
// alkalmas, egy mondatos következtetés (lásd lib/leadgen/scoring.ts).

const PHONE_REGEX = /(\+36|06)[\s\-./]?\(?\d{1,2}\)?[\s\-./]?\d{3}[\s\-./]?\d{3,4}/;

export type WebsiteStatusVerdict = "very_good" | "average" | "outdated" | "poor" | "none";

export interface WebsiteAuditOutcome {
  websiteStatus: WebsiteStatusVerdict;
  websiteMobileFriendly: boolean | null;
  websiteTitle: string | null;
  phoneMain: string | null;
  phoneSource: string | null;
}

function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "-") return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

const EMPTY_RESULT: WebsiteAuditOutcome = {
  websiteStatus: "none",
  websiteMobileFriendly: null,
  websiteTitle: null,
  phoneMain: null,
  phoneSource: null,
};

export async function auditWebsite(rawUrl: string): Promise<WebsiteAuditOutcome> {
  const url = normalizeUrl(rawUrl);
  if (!url) return EMPTY_RESULT;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; RunMateLeadGenBot/1.0)" },
    });
    if (!res.ok) return EMPTY_RESULT;

    const html = await res.text();
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim().slice(0, 200) || null : null;
    const hasViewport = /<meta[^>]+name=["']viewport["']/i.test(html);
    const phoneMatch = html.match(PHONE_REGEX);
    const phone = phoneMatch ? phoneMatch[0].trim() : null;

    // Az automata audit óvatos: csak "átlagos"-ig merészkedik felfelé —
    // "nagyon jó" minősítést csak ember adhat, kézi felülbírálással.
    let status: WebsiteStatusVerdict;
    if (!title) status = "poor";
    else if (!hasViewport) status = "outdated";
    else status = "average";

    return {
      websiteStatus: status,
      websiteMobileFriendly: hasViewport,
      websiteTitle: title,
      phoneMain: phone,
      phoneSource: phone ? "weboldalról (automata audit)" : null,
    };
  } catch {
    return EMPTY_RESULT;
  } finally {
    clearTimeout(timeout);
  }
}
