import { GoogleGenAI } from "@google/genai";
import { config } from "../../config.js";

export interface SynthesizeInput {
  companyName: string;
  contactName: string | null;
  websiteAnalysis: string | null;
  socialManualNotes: string;
}

export interface SynthesizeResult {
  callHook: string;
  callScript: string;
  fullAudit: string;
}

const RESULT_SCHEMA = {
  type: "object",
  properties: {
    callHook: { type: "string" },
    callScript: { type: "string" },
    fullAudit: { type: "string" },
  },
  required: ["callHook", "callScript", "fullAudit"],
  additionalProperties: false,
};

let client: GoogleGenAI | undefined;

export function isLeadResearchSynthesisEnabled(): boolean {
  return Boolean(config.geminiApiKey);
}

function getClient(): GoogleGenAI {
  if (!config.geminiApiKey) {
    throw new Error("GEMINI_API_KEY nincs beállítva a szerveren");
  }
  if (!client) {
    client = new GoogleGenAI({ apiKey: config.geminiApiKey });
  }
  return client;
}

function buildPrompt(input: SynthesizeInput): string {
  const lines = [
    `Cégnév: ${input.companyName}`,
    input.contactName ? `Kapcsolattartó: ${input.contactName}` : "Kapcsolattartó: nem ismert",
    "",
    "Weboldal-elemzés:",
    input.websiteAnalysis?.trim() || "Nincs weboldal / nincs elérhető adat.",
    "",
    "Kézi kutatási jegyzetek (kolléga gyűjtötte, social media / egyéb):",
    input.socialManualNotes.trim() || "Nincs kézi jegyzet.",
    "",
    "Feladat: a fenti adatok alapján készíts három kimenetet egy hideg B2B értékesítési híváshoz.",
    "",
    "SZIGORÚ SZABÁLYOK — ezek megszegése súlyos hiba:",
    "- SOHA ne találj ki, ne becsülj, ne feltételezz adatot (pl. követő-szám, posztolási gyakoriság, bevétel, létszám). " +
      "Csak azt használd, ami a fenti weboldal-elemzésben vagy kézi jegyzetekben ténylegesen szerepel.",
    "- Ha egy infó nincs a fenti adatokban, egyszerűen ne hivatkozz rá — ne írj helyette plauzibilis, de kitalált állítást.",
    "- Ha az összes rendelkezésre álló adat gyér/kevés, a call_script végén EGY rövid mondatban jelezd, hogy ez egy általános, " +
      "nem cégspecifikus megközelítés (mert kevés adat állt rendelkezésre).",
    "",
    "1) callHook: 2-3 mondatos \"hívás-hook\" — mire figyeljen a hívó, mielőtt tárcsáz.",
    "",
    "2) callScript: hideghívás-script, LEGFELJEBB 150 SZÓ, kötött szerkezetben, ebben a sorrendben:",
    "   a) nyitás (bemutatkozás)",
    "   b) EGY konkrét ok, amiért most hívunk (ha van rá adat) vagy egy általános, releváns ok",
    "   c) EGY nyitott kérdés a partnernek",
    "   d) KÉT várható ellenvetés, mindkettőhöz egy rövid válasszal",
    "   e) lágy zárás: rövid, informális találkozó kérése (nem kemény eladás)",
    "   Élőbeszéd stílusban írd, ahogy egy ember tényleg mondaná telefonban. NE legyen benne rangsorolt kritikalista " +
      "az ügyfél weboldaláról/social médiájáról. Legfeljebb EGY semleges (nem kritizáló) megfigyelés szerepelhet benne. " +
      "SOHA ne ígérj konkrét eredményt (pl. \"X%-kal fog nőni a forgalmuk\").",
    "",
    "3) fullAudit: részletesebb, több bekezdéses összefoglaló egy személyes találkozóra készülve — ami a fenti adatokból " +
      "tényszerűen megállapítható (weboldal állapota, amit a kézi jegyzetek tartalmaznak), strukturáltan, magyarul.",
    "",
    "Mindhárom mezőt magyarul írd.",
  ];
  return lines.join("\n");
}

export async function synthesizeCallMaterials(input: SynthesizeInput): Promise<SynthesizeResult> {
  const ai = getClient();
  const response = await ai.interactions.create({
    model: "gemini-flash-latest",
    input: [{ type: "text", text: buildPrompt(input) }],
    response_format: {
      type: "text",
      mime_type: "application/json",
      schema: RESULT_SCHEMA,
    },
  });

  const text = response.output_text;
  if (!text) {
    throw new Error("Az AI nem adott vissza szöveges választ");
  }
  return JSON.parse(text) as SynthesizeResult;
}
