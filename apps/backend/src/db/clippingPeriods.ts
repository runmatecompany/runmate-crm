import { pool } from "./pool.js";

// Ügyfelenkénti/havonkénti fizetés-jóváhagyási állapot a Clippelés
// szolgáltatáshoz — amíg nincs jóváhagyva, a kész videók száma el van
// rejtve a csapat elől (lásd lib/clipping.ts getClippingProgress). A sor
// lazán jön létre: amíg senki nem hagyja jóvá a fizetést, nincs is rá
// szükség sorra, a hiány pedig magától "nincs jóváhagyva"-ként olvasódik.
export async function isClippingPaymentConfirmed(clientId: number, yearMonth: string): Promise<boolean> {
  const { rows } = await pool.query<{ payment_confirmed: boolean }>(
    `SELECT payment_confirmed FROM clipping_periods WHERE client_id = $1 AND year_month = $2`,
    [clientId, yearMonth]
  );
  return rows[0]?.payment_confirmed ?? false;
}

export async function confirmClippingPayment(clientId: number, yearMonth: string): Promise<void> {
  await pool.query(
    `INSERT INTO clipping_periods (client_id, year_month, payment_confirmed) VALUES ($1, $2, true)
     ON CONFLICT (client_id, year_month) DO UPDATE SET payment_confirmed = true`,
    [clientId, yearMonth]
  );
}
