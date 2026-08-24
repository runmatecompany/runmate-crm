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
  invoiceNumber?: string;
  issueDate: string;
  dueDate?: string;
  driveLink?: string;
  notes?: string;
}

export async function createInvoice(input: InvoiceInput, createdBy: number): Promise<InvoiceRow> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO invoices (client_id, description, amount, invoice_number, issue_date, due_date, drive_link, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id`,
    [
      input.clientId,
      input.description,
      input.amount,
      input.invoiceNumber ?? null,
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

export async function updateInvoice(id: number, input: InvoiceInput): Promise<InvoiceRow | undefined> {
  const { rowCount } = await pool.query(
    `UPDATE invoices SET
       client_id = $2, description = $3, amount = $4, invoice_number = $5, issue_date = $6,
       due_date = $7, drive_link = $8, notes = $9, updated_at = now()
     WHERE id = $1`,
    [
      id,
      input.clientId,
      input.description,
      input.amount,
      input.invoiceNumber ?? null,
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
