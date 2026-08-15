import { getAuthorizedClient } from "../googleCalendar/oauth.js";
import { listAllClients, setClientDriveFolders } from "../../db/clients.js";
import { getClientsRootFolder } from "./root.js";
import { findOrCreateFolder } from "./api.js";
import { ensureMonthFolder } from "./upload.js";

// Minden ügyfélnek biztosítja a folyó hónap Drive-mappáját
// ("Runmate CRM/Ügyfelek/{cégnév}/ÉÉÉÉ-HH"). Naponta fut (server.ts), és
// egyszer induláskor is — nem egy "ma van-e a hónap 1.?" ellenőrzés, hanem
// idempotens find-or-create minden kliensre, hogy akkor is bepótolja a
// hónapváltást, ha a szerver épp aludt a hónap első napján.
export async function provisionCurrentMonthFoldersForAllClients(): Promise<void> {
  const oauth = await getAuthorizedClient();
  if (!oauth) return; // nincs Google-kapcsolat, kihagyjuk

  const yearMonth = new Date().toISOString().slice(0, 7);
  const clients = await listAllClients();
  if (clients.length === 0) return;

  const ugyfelekRoot = await getClientsRootFolder(oauth);

  for (const client of clients) {
    let clientFolderId = client.drive_folder_id;
    if (!clientFolderId) {
      const clientFolder = await findOrCreateFolder(oauth, ugyfelekRoot.id, client.company_name);
      clientFolderId = clientFolder.id;
      await setClientDriveFolders(client.id, { driveFolderId: clientFolderId });
    }
    await ensureMonthFolder(oauth, client.id, clientFolderId, yearMonth);
  }
}
