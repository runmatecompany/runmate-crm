import { createLeadGenCompany, findDuplicateLeadGenCompany } from "../../db/leadgenCompanies.js";

// Nincs jó, tömegesen szűrhető magyar cégadatbázis ingyen — a specifikáció
// szerint a kézi CSV-feltöltés a biztonsági háló, ami akkor is működik, ha
// minden más forrás elromlik. Ezért egyszerű, függőség nélküli CSV-
// feldolgozás: magyar Excel-exportnál gyakori a pontosvessző elválasztó a
// vessző helyett, ezt a fejléc-sor alapján automatikusan felismerjük.

export function detectCsvDelimiter(text: string): "," | ";" {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const commas = (firstLine.match(/,/g) ?? []).length;
  const semicolons = (firstLine.match(/;/g) ?? []).length;
  return semicolons > commas ? ";" : ",";
}

export function parseCsv(text: string, delimiter: "," | ";"): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  while (i < len) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += char;
      i++;
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (char === delimiter) {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (char === "\r") {
      i++;
      continue;
    }
    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += char;
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

export type LeadGenCsvField =
  | "companyName"
  | "taxNumber"
  | "website"
  | "phoneMain"
  | "address"
  | "city"
  | "county"
  | "industry"
  | "revenueCurrent"
  | "revenueYear";

// header index -> mezőnév, "" = kihagyva
export type LeadGenCsvMapping = Record<number, LeadGenCsvField | "">;

export interface LeadGenImportSummary {
  imported: number;
  skippedDuplicates: number;
  skippedMissingData: number;
  total: number;
}

export async function importLeadGenCsv(
  csvText: string,
  mapping: LeadGenCsvMapping,
  createdBy: number
): Promise<LeadGenImportSummary> {
  const delimiter = detectCsvDelimiter(csvText);
  const rows = parseCsv(csvText, delimiter);
  const dataRows = rows.slice(1); // az első sor fejléc

  let imported = 0;
  let skippedDuplicates = 0;
  let skippedMissingData = 0;

  for (const row of dataRows) {
    const get = (field: LeadGenCsvField): string | undefined => {
      for (const [idxStr, mappedField] of Object.entries(mapping)) {
        if (mappedField === field) {
          const value = row[Number(idxStr)]?.trim();
          return value || undefined;
        }
      }
      return undefined;
    };

    const companyName = get("companyName");
    const website = get("website");
    const taxNumber = get("taxNumber");

    // A specifikáció minimumkövetelménye: cégnév, weboldal vagy adószám
    // közül legalább egy kell — a többit a rendszer később deríti ki.
    if (!companyName && !website && !taxNumber) {
      skippedMissingData++;
      continue;
    }

    const effectiveName = companyName || website || taxNumber!;
    const duplicate = await findDuplicateLeadGenCompany(taxNumber ?? null, effectiveName);
    if (duplicate) {
      skippedDuplicates++;
      continue;
    }

    const revenueCurrentRaw = get("revenueCurrent");
    const revenueYearRaw = get("revenueYear");

    await createLeadGenCompany({
      companyName: effectiveName,
      taxNumber,
      website,
      phoneMain: get("phoneMain"),
      phoneSource: get("phoneMain") ? "CSV import" : undefined,
      address: get("address"),
      city: get("city"),
      county: get("county"),
      industry: get("industry"),
      revenueCurrent: revenueCurrentRaw ? Number(revenueCurrentRaw.replace(/[^\d.]/g, "")) : undefined,
      revenueYear: revenueYearRaw ? Number(revenueYearRaw) : undefined,
      revenueSource: revenueCurrentRaw ? "CSV import" : undefined,
      seedSource: "csv",
      createdBy,
    });
    imported++;
  }

  return { imported, skippedDuplicates, skippedMissingData, total: dataRows.length };
}
