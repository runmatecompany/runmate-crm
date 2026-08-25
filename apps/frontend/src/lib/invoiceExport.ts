import type { Invoice } from "./billing";

// A könyvelőnek átadható éves lista — exceljs-t dinamikusan importáljuk
// (mint a lib/xlsxToCsv.ts is), hogy a ~950 kB-os csomag csak akkor kerüljön
// be a futó kódba, ha valaki ténylegesen exportál, ne minden oldalbetöltéskor.
export async function exportInvoicesToXlsx(invoices: Invoice[], filenameSuffix: string): Promise<void> {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Számlák");
  sheet.columns = [
    { header: "Számlaszám", key: "number", width: 14 },
    { header: "Ügyfél", key: "client", width: 28 },
    { header: "Tétel", key: "description", width: 36 },
    { header: "Összeg (EUR)", key: "amount", width: 14 },
    { header: "Kiállítás dátuma", key: "issueDate", width: 16 },
    { header: "Fizetési határidő", key: "dueDate", width: 16 },
    { header: "Állapot", key: "status", width: 12 },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const invoice of invoices) {
    sheet.addRow({
      number: invoice.invoice_number ?? "",
      client: invoice.client_name,
      description: invoice.description,
      amount: Number(invoice.amount),
      issueDate: invoice.issue_date,
      dueDate: invoice.due_date ?? "",
      status: invoice.status === "paid" ? "Fizetve" : "Kiadva",
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `szamlak_${filenameSuffix}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
