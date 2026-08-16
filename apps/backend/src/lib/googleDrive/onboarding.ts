import { getAuthorizedClient } from "../googleCalendar/oauth.js";
import { getClientById, setClientDriveFolders, type ClientRow } from "../../db/clients.js";
import { findOrCreateFolder } from "./api.js";
import { getClientsRootFolder } from "./root.js";
import { ensureMonthFolder } from "./upload.js";

// Ügyfél-onboardingkor (kézi létrehozás vagy Lead → Ügyfél konverzió) hívva.
// Szándékosan best-effort: ha nincs Google-kapcsolat, vagy a Drive-hívás
// hibázik, ne akassza meg magát az ügyfél létrehozását — a hívó fél elkapja
// és csak logolja a hibát, a mappalánc később pótolható.
export async function provisionClientDriveFolders(client: ClientRow): Promise<void> {
  const oauth = await getAuthorizedClient();
  if (!oauth) return; // nincs Google-kapcsolat, kihagyjuk

  const ugyfelekRoot = await getClientsRootFolder(oauth);
  const clientFolder = await findOrCreateFolder(oauth, ugyfelekRoot.id, client.company_name);
  await setClientDriveFolders(client.id, { driveFolderId: clientFolder.id });

  // A friss ügyfélnek egyből legyen meg a folyó hónap mappája is, ne kelljen
  // a napi ütemezett provisioning-ra várnia.
  const yearMonth = new Date().toISOString().slice(0, 7);
  await ensureMonthFolder(oauth, client.id, clientFolder.id, yearMonth);
}

// Amikor egy tartalom "scriptre vár" állapotba kerül (létrehozáskor, kézzel
// vagy a naptár-szinkronból), a hozzá tartozó hónap-mappa (az adott tartalom
// forgatási dátuma szerinti hónap, vagy ha az még nincs megadva, a mai hónap)
// azonnal létrejöjjön — ne kelljen a napi provisioning-ra vagy az első
// nyersanyag-feltöltésre várni ahhoz, hogy a script dokumentum bekerülhessen.
// Szándékosan best-effort, mint a többi Drive-hívás.
export async function ensureContentItemMonthFolder(clientId: number, forDate: Date | string | null): Promise<void> {
  const oauth = await getAuthorizedClient();
  if (!oauth) return;

  let client = await getClientById(clientId);
  if (!client) return;
  if (!client.drive_folder_id) {
    await provisionClientDriveFolders(client);
    client = await getClientById(clientId);
  }
  if (!client?.drive_folder_id) return;

  const yearMonth = (forDate ? new Date(forDate) : new Date()).toISOString().slice(0, 7);
  await ensureMonthFolder(oauth, client.id, client.drive_folder_id, yearMonth);
}
