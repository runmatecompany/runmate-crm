import { pool } from "./pool.js";

// A clients.contact_name/phone/email marad az elsődleges kapcsolattartó —
// ez a tábla a TOVÁBBI kapcsolattartókhoz (pl. egy nagyobb ügyfélnél több
// döntéshozó/kapcsolattartó is lehet), egyszerű lista, nincs "elsődleges"
// jelölés közöttük.
export interface ClientContactRow {
  id: number;
  client_id: number;
  name: string;
  email: string | null;
  phone: string | null;
  created_at: string;
}

export async function listClientContacts(clientId: number): Promise<ClientContactRow[]> {
  const { rows } = await pool.query<ClientContactRow>(
    `SELECT id, client_id, name, email, phone, created_at
     FROM client_contacts WHERE client_id = $1 ORDER BY created_at ASC`,
    [clientId]
  );
  return rows;
}

export interface ClientContactInput {
  name: string;
  email?: string;
  phone?: string;
}

// Nincs finomszemcsés "hozzáadás/törlés" végpont — a szerkesztő form
// egyszerűen a teljes listát küldi minden mentéskor, itt cseréljük le
// egy tranzakcióban (törlés + újra-beszúrás), ugyanaz az elv, mint a
// leadgen CSV-importnál volt.
export async function replaceClientContacts(clientId: number, contacts: ClientContactInput[]): Promise<ClientContactRow[]> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM client_contacts WHERE client_id = $1`, [clientId]);
    for (const contact of contacts) {
      if (!contact.name.trim()) continue;
      await client.query(
        `INSERT INTO client_contacts (client_id, name, email, phone) VALUES ($1, $2, $3, $4)`,
        [clientId, contact.name.trim(), contact.email?.trim() || null, contact.phone?.trim() || null]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return listClientContacts(clientId);
}
