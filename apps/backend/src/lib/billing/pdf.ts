import PDFDocument from "pdfkit";
import type { InvoiceRow } from "../../db/invoices.js";
import type { BillingIssuerSettings } from "../../db/billingIssuerSettings.js";
import type { ClientRow } from "../../db/clients.js";

function formatAmount(amount: string): string {
  return `${Number(amount).toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}.`;
}

// Osztrák Kleinunternehmer-számla (§ 11 UStG kötelező tartalom, ÁFA-sor
// nélkül, a § 6 Abs. 1 Z 27 UStG mentesség-hivatkozással). Egy tétel
// számlánként — a mai adatmodell szerint (leírás + összeg).
export function buildInvoicePdf(invoice: InvoiceRow, issuer: BillingIssuerSettings, client: ClientRow): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.font("Helvetica-Bold").fontSize(20).text("Rechnung");
    doc.font("Helvetica").fontSize(10).moveDown(0.5);
    doc.text(`Rechnungsnummer: ${invoice.invoice_number ?? "-"}`);
    doc.text(`Rechnungsdatum: ${formatDate(invoice.issue_date)}`);
    if (invoice.due_date) doc.text(`Zahlungsziel: ${formatDate(invoice.due_date)}`);

    doc.moveDown(1.5);
    doc.font("Helvetica-Bold").text("Rechnungssteller");
    doc.font("Helvetica");
    if (issuer.business_name) doc.text(issuer.business_name);
    if (issuer.address) doc.text(issuer.address);
    if (issuer.email) doc.text(issuer.email);

    doc.moveDown(1);
    doc.font("Helvetica-Bold").text("Rechnungsempfänger");
    doc.font("Helvetica");
    doc.text(client.billing_name || client.company_name);
    const billingAddress = client.billing_address || client.address;
    if (billingAddress) doc.text(billingAddress);

    doc.moveDown(1.5);
    const tableTop = doc.y;
    doc.font("Helvetica-Bold");
    doc.text("Beschreibung", 50, tableTop, { width: 340 });
    doc.text("Betrag", 400, tableTop);
    doc
      .moveTo(50, tableTop + 16)
      .lineTo(545, tableTop + 16)
      .stroke();

    doc.font("Helvetica");
    const rowY = tableTop + 22;
    doc.text(invoice.description, 50, rowY, { width: 340 });
    doc.text(formatAmount(invoice.amount), 400, rowY);

    doc.moveDown(2);
    doc
      .moveTo(350, doc.y)
      .lineTo(545, doc.y)
      .stroke();
    doc.moveDown(0.3);
    doc.font("Helvetica-Bold").text(`Gesamtbetrag: ${formatAmount(invoice.amount)}`, 350, doc.y, {
      width: 195,
      align: "right",
    });

    doc.moveDown(2);
    doc.font("Helvetica").fontSize(9).fillColor("#555555");
    doc.text("Gemäß § 6 Abs. 1 Z 27 UStG (Kleinunternehmerregelung) wird keine Umsatzsteuer in Rechnung gestellt.");

    if (issuer.iban) {
      doc.moveDown(0.5);
      doc.text(`Zahlung bitte auf folgendes Konto: ${issuer.iban}`);
    }

    doc.end();
  });
}
