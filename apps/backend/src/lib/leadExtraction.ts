import { GoogleGenAI } from "@google/genai";
import { config } from "../config.js";
import { assertAiQuotaAvailable } from "../db/aiUsage.js";

export interface LeadImageInput {
  mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  base64: string;
}

export interface LeadDocumentInput {
  filename: string;
  text: string;
}

export interface ExtractedLeadFields {
  companyName: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
}

const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] };

const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    companyName: nullableString,
    contactName: nullableString,
    phone: nullableString,
    email: nullableString,
    address: nullableString,
    notes: nullableString,
  },
  required: ["companyName", "contactName", "phone", "email", "address", "notes"],
  additionalProperties: false,
};

let client: GoogleGenAI | undefined;

export function isLeadExtractionEnabled(): boolean {
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

// Fényképek (pl. névjegykártya, képernyőfotó) és/vagy dokumentumok (pl.
// Excel-táblázatból kliens-oldalon szöveggé alakított cégadat, lásd
// lib/xlsxToCsv.ts a frontenden) alapján próbálja meg kitölteni a lead
// mezőit. Amit nem talál, azt null-lal jelzi vissza — a hívó fél csak a
// nem-null mezőket illeszti be az űrlapba.
//
// A régebbi generateContent()-es Gemini API 2026 közepén megszűnt új
// felhasználóknak — a jelenlegi felület az Interactions API
// (ai.interactions.create), élőben tesztelve és ellenőrizve.
export async function extractLeadFromMedia(
  images: LeadImageInput[],
  documents: LeadDocumentInput[]
): Promise<ExtractedLeadFields> {
  await assertAiQuotaAvailable();
  const ai = getClient();

  const response = await ai.interactions.create({
    model: "gemini-flash-latest",
    input: [
      {
        type: "text",
        text:
          "Ezek a fájlok egy potenciális üzleti ügyfélről (lead) tartalmaznak adatokat " +
          "(pl. névjegykártya, weboldal képernyőfotó, cégadatbázis-bejegyzés, vagy egy " +
          "Excel-táblázatból szöveggé alakított cégadat). Ha egy dokumentum több sort/céget " +
          "tartalmaz, az elsőt vagy a legteljesebb adatú sort vedd alapul. " +
          "Olvasd ki belőlük, ami megállapítható: cégnév, kapcsolattartó neve, telefonszám, " +
          "email cím, cím, és bármi egyéb hasznos infó a 'notes' mezőbe (pl. beosztás, weboldal, tevékenységi kör). " +
          "Amit nem találsz meg egyértelműen a fájlokban, azt hagyd null-on. Ne találj ki adatot.",
      },
      ...images.map((image) => ({
        type: "image" as const,
        data: image.base64,
        mime_type: image.mediaType,
      })),
      ...documents.map((doc) => ({
        type: "text" as const,
        text: `--- Dokumentum: ${doc.filename} ---\n${doc.text}`,
      })),
    ],
    response_format: {
      type: "text",
      mime_type: "application/json",
      schema: EXTRACTION_SCHEMA,
    },
  });

  const text = response.output_text;
  if (!text) {
    throw new Error("Az AI nem adott vissza szöveges választ");
  }
  return JSON.parse(text) as ExtractedLeadFields;
}
