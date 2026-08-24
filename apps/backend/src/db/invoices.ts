import { pool } from "./pool.js";

export type InvoiceStatus = "unpaid" | "paid";

export interface InvoiceRow {
  id: number;
  client_id: number;
  client_name: string;
  description: string;
  // A node-postgres a NUMERIC oszlopot stringként adja vissza, hogy ne
  // veszítsen pontosságot lebegőpontos konverzióval — szándékosan marad
  // string, a frontend csak megjelenítéskor/összegzéskor alakítja számmá.
  amount: string;
  invoice_number: string | null;
  issue_date: string;
  due_date: string | null;
  status: InvoiceStatus;
  paid_at: string | null;
  drive_link: string | null;
  notes: string | null;
  created_by: number | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

const INVOICE_SELECT = `
  SELECT
    i.id, i.client_id, c.company_name AS client_name, i.description, i.amount, i.invoice_number,
    i.issue_date, i.due_date, i.status, i.paid_at, i.drive_link, i.notes,
    i.created_by, cu.name AS created_by_name,
    i.created_at, i.updated_at
  FROM invoices i
  JOIN clients c ON c.id = i.client_id
  LEFT JOIN users cu ON cu.id = i.created_by
`;

export async function listInvoices(): Promise<InvoiceRow[]> {
  const { rows } = await pool.query<InvoiceRow>(`${INVOICE_SELECT} ORDER BY i.issue_date DESC, i.id DESC`);
  return rows;
}

export async function getInvoiceById(id: number): Promise<InvoiceRow | undefined> {
  const { rows } = await pool.query<InvoiceRow>(`${INVOICE_SELECT} WHERE i.id = $1`, [id]);
  return rows[0];
}

export interface InvoiceInput {
  clientId: number;
  description: string;
  amount: string;
  issueDate: string;
  dueDate?: string;
  driveLink?: string;
  notes?: string;
}

// A számlaszám kiosztása tranzakción belül, sorzárolással történik, hogy
// két párhuzamos létrehozás se kaphassa meg ugyanazt a sorszámot.
// Évfordulón (next_invoice_year != aktuális év) a számláló nullázódik.
// A visszaadott formátum "{év}-{sorszám 3 jeggyel}", pl. "2026-001".
async function allocateInvoiceNumber(): Promise<string> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ next_invoice_number: number; next_invoice_year: number }>(
      `SELECT next_invoice_number, next_invoice_year FROM billing_issuer_settings WHERE id = 1 FOR UPDATE`
    );
    const currentYear = new Date().getFullYear();
    const row = rows[0];
    const sameYear = row != null && row.next_invoice_year === currentYear;
    const number = sameYear ? row.next_invoice_number : 1;
    await client.query(
      `UPDATE billing_issuer_settings SET next_invoice_number = $1, next_invoice_year = $2 WHERE id = 1`,
      [number + 1, currentYear]
    );
    await client.query("COMMIT");
    return `${currentYear}-${String(number).padStart(3, "0")}`;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function createInvoice(input: InvoiceInput, createdBy: number): Promise<InvoiceRow> {
  const invoiceNumber = await allocateInvoiceNumber();
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO invoices (client_id, description, amount, invoice_number, issue_date, due_date, drive_link, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id`,
    [
      input.clientId,
      input.description,
      input.amount,
      invoiceNumber,
      input.issueDate,
      input.dueDate ?? null,
      input.driveLink ?? null,
      input.notes ?? null,
      createdBy,
    ]
  );
  const created = await getInvoiceById(rows[0].id);
  return created!;
}

// A számlaszám szándékosan nem paraméter itt — egyszer, létrehozáskor
// osztódik ki, szerkesztéskor nem írható át (lásd a terv "Döntések" pontját).
export async function updateInvoice(id: number, input: InvoiceInput): Promise<InvoiceRow | undefined> {
  const { rowCount } = await pool.query(
    `UPDATE invoices SET
       client_id = $2, description = $3, amount = $4, issue_date = $5,
       due_date = $6, drive_link = $7, notes = $8, updated_at = now()
     WHERE id = $1`,
    [
      id,
      input.clientId,
      input.description,
      input.amount,
      input.issueDate,
      input.dueDate ?? null,
      input.driveLink ?? null,
      input.notes ?? null,
    ]
  );
  if (!rowCount) return undefined;
  return getInvoiceById(id);
}

export async function setInvoiceStatus(id: number, status: InvoiceStatus): Promise<InvoiceRow | undefined> {
  const { rowCount } = await pool.query(
    `UPDATE invoices SET status = $2, paid_at = CASE WHEN $2 = 'paid' THEN now() ELSE NULL END, updated_at = now()
     WHERE id = $1`,
    [id, status]
  );
  if (!rowCount) return undefined;
  return getInvoiceById(id);
}

export async function deleteInvoice(id: number): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM invoices WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}
