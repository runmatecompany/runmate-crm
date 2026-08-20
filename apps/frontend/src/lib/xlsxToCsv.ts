import ExcelJS from "exceljs";

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

// Közös Excel→CSV-szöveg átalakító — a Lead Gen import (CsvImportModal) és
// a Lead AI-kitöltés (LeadFormModal) is ezt használja. Az `xlsx` (SheetJS)
// csomag npm-re publikált verziója helyett szándékosan exceljs-t
// használunk: az xlsx-nek ismert, magas súlyosságú biztonsági rése van
// (prototype pollution, ReDoS), ez a függvény pedig felhasználó által
// feltöltött, nem megbízható fájlokat dolgoz fel.
export async function xlsxFileToCsvText(file: File): Promise<string> {
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
  return lines.join("\n");
}
