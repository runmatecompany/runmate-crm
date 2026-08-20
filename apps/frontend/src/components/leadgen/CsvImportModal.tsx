import { useState } from "react";
import ExcelJS from "exceljs";
import { useAuth } from "../../lib/auth";
import { importLeadGenCsv, type LeadGenCsvField, type LeadGenCsvMapping, type LeadGenImportSummary } from "../../lib/leadgen";
import { useEscapeToClose } from "../../lib/useEscapeToClose";

interface CsvImportModalProps {
  onClose: () => void;
  onImported: () => void;
}

const FIELD_OPTIONS: { value: LeadGenCsvField | ""; label: string }[] = [
  { value: "", label: "— Kihagyás —" },
  { value: "companyName", label: "Cégnév" },
  { value: "taxNumber", label: "Adószám" },
  { value: "website", label: "Weboldal" },
  { value: "phoneMain", label: "Telefonszám" },
  { value: "address", label: "Cím" },
  { value: "city", label: "Város" },
  { value: "county", label: "Megye" },
  { value: "industry", label: "Iparág" },
  { value: "revenueCurrent", label: "Árbevétel" },
  { value: "revenueYear", label: "Árbevétel éve" },
];

// Egyszerű fejléc-heurisztika a mezők automatikus felajánlásához — a
// tényleges, teljes CSV-feldolgozás a szerveren történik (lib/leadgen/csvImport.ts),
// ez csak a felhasználói kényelmet szolgálja.
function guessField(header: string): LeadGenCsvField | "" {
  const h = header.toLowerCase().trim();
  if (/cégnév|cegnev|company|név|nev/.test(h)) return "companyName";
  if (/adószám|adoszam|tax/.test(h)) return "taxNumber";
  if (/weboldal|website|honlap|url/.test(h)) return "website";
  if (/telefon|phone|tel\b/.test(h)) return "phoneMain";
  if (/cím|cim|address/.test(h)) return "address";
  if (/város|varos|city/.test(h)) return "city";
  if (/megye|county/.test(h)) return "county";
  if (/iparág|iparag|industry|ágazat|agazat/.test(h)) return "industry";
  if (/árbevétel|arbevetel|revenue/.test(h)) return "revenueCurrent";
  return "";
}

// Ha valaki tévedésből egy nem CSV (pl. .xlsx bináris) fájlt választ ki,
// abban gyakran nincs semmilyen sortörésnek felismerhető karakter — ekkor
// a teljes fájltartalom "egyetlen fejlécoszlopként" végződne, amit a DOM-ba
// renderelve (akár több MB-os szövegcsomópontként) a webview érdemben
// lefagyhat. Ezért itt limitáljuk a vizsgált szakaszt.
const MAX_HEADER_SCAN_CHARS = 20000;
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

// Az Excel-fájlt a böngészőben, kliens-oldalon alakítjuk át CSV-szöveggé,
// hogy utána a fájl-kiválasztástól a feltöltésig minden a meglévő,
// jól tesztelt CSV-útvonalon menjen — a szervernek nem kell tudnia az
// Excel-formátumról. Az `xlsx` (SheetJS) csomag npm-re publikált verziója
// ismert, magas súlyosságú biztonsági résekkel rendelkezik (prototype
// pollution, ReDoS) — mivel ez felhasználó által feltöltött, nem
// megbízható fájlokat dolgoz fel, helyette az exceljs csomagot használjuk.
async function convertXlsxToCsvFile(file: File): Promise<File> {
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error("Az Excel fájl nem tartalmaz munkalapot.");

  const lines: string[] = [];
  worksheet.eachRow({ includeEmpty: true }, (row) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      cells.push(csvEscape(cell.text ?? ""));
    });
    lines.push(cells.join(","));
  });

  const csvText = lines.join("\n");
  return new File([csvText], file.name.replace(/\.xlsx?$/i, ".csv"), { type: "text/csv" });
}

function splitFirstLine(text: string): string[] {
  const scanText = text.length > MAX_HEADER_SCAN_CHARS ? text.slice(0, MAX_HEADER_SCAN_CHARS) : text;
  const firstLine = scanText.split(/\r?\n/, 1)[0] ?? "";
  const commas = (firstLine.match(/,/g) ?? []).length;
  const semicolons = (firstLine.match(/;/g) ?? []).length;
  const delimiter = semicolons > commas ? ";" : ",";
  return firstLine
    .split(delimiter)
    .map((h) => h.trim().replace(/^"|"$/g, ""))
    .map((h) => (h.length > 200 ? `${h.slice(0, 200)}…` : h));
}

export default function CsvImportModal({ onClose, onImported }: CsvImportModalProps) {
  useEscapeToClose(onClose);
  const { auth } = useAuth();
  const token = auth?.token ?? null;

  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<LeadGenCsvMapping>({});
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<LeadGenImportSummary | null>(null);

  async function handleFileSelected(rawFile: File) {
    setError(null);
    setHeaders([]);
    setMapping({});
    if (rawFile.size > MAX_FILE_SIZE_BYTES) {
      setFile(null);
      setError(
        `A fájl túl nagy (${Math.round(rawFile.size / 1024 / 1024)} MB). Az import legfeljebb ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB méretig támogatott.`
      );
      return;
    }

    let f = rawFile;
    if (/\.xlsx?$/i.test(rawFile.name)) {
      try {
        f = await convertXlsxToCsvFile(rawFile);
      } catch {
        setFile(null);
        setError("Nem sikerült beolvasni az Excel fájlt — ellenőrizd, hogy valódi .xlsx fájlt választottál-e ki.");
        return;
      }
    }

    setFile(f);
    try {
      const text = await f.text();
      const cols = splitFirstLine(text);
      if (cols.length > 200) {
        setFile(null);
        setError("A fájl fejléce értelmezhetetlenül sok oszlopot tartalmaz — valódi CSV fájlt választottál ki?");
        return;
      }
      setHeaders(cols);
      const guessed: LeadGenCsvMapping = {};
      cols.forEach((h, i) => {
        const guess = guessField(h);
        if (guess) guessed[i] = guess;
      });
      setMapping(guessed);
    } catch {
      setFile(null);
      setError("Nem sikerült beolvasni a fájlt — ellenőrizd, hogy valódi CSV fájlt választottál-e ki.");
    }
  }

  const hasRequiredMapping = Object.values(mapping).some((v) => v === "companyName" || v === "website" || v === "taxNumber");

  async function handleImport() {
    if (!token || !file) return;
    setImporting(true);
    setError(null);
    try {
      const result = await importLeadGenCsv(token, file, mapping);
      setSummary(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült importálni a CSV-t");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="chat-modal-backdrop">
      <div className="chat-modal lead-form">
        <h2>CSV / Excel import</h2>

        {!summary ? (
          <>
            <p className="chat-modal-hint">
              Bármilyen forrásból származó CSV vagy Excel (.xlsx) fájl feltölthető — minimum a cégnév, weboldal
              vagy adószám oszlopok egyike szükséges, a többit a rendszer később kiegészíti.
            </p>

            <input
              type="file"
              accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => {
                const f = e.currentTarget.files?.[0];
                if (f) void handleFileSelected(f);
              }}
            />

            {headers.length > 0 && (
              <div className="lg-csv-mapping">
                {headers.map((header, i) => (
                  <div key={i} className="lg-csv-mapping-row">
                    <span className="lg-csv-mapping-header">{header || `(${i + 1}. oszlop)`}</span>
                    <select
                      value={mapping[i] ?? ""}
                      onChange={(e) =>
                        setMapping((prev) => ({ ...prev, [i]: e.currentTarget.value as LeadGenCsvField | "" }))
                      }
                    >
                      {FIELD_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}

            {headers.length > 0 && !hasRequiredMapping && (
              <p className="login-error">Legalább a cégnév, weboldal vagy adószám egyikét hozzá kell rendelni egy oszlophoz.</p>
            )}
            {error && <p className="login-error">{error}</p>}

            <div className="chat-modal-actions">
              <button type="button" onClick={onClose} disabled={importing}>
                Mégse
              </button>
              <button type="button" onClick={() => void handleImport()} disabled={importing || !file || !hasRequiredMapping}>
                {importing ? "Importálás..." : "Importálás"}
              </button>
            </div>
          </>
        ) : (
          <>
            <p>
              <strong>{summary.imported}</strong> cég importálva a(z) <strong>{summary.total}</strong> sorból.
              {summary.skippedDuplicates > 0 && ` ${summary.skippedDuplicates} már létező cég kihagyva.`}
              {summary.skippedMissingData > 0 && ` ${summary.skippedMissingData} sor hiányos adat miatt kihagyva.`}
            </p>
            <div className="chat-modal-actions">
              <button type="button" onClick={onImported}>
                Kész
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
