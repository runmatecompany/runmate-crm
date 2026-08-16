import type { OAuth2Client } from "google-auth-library";
import { getAuthorizedClient } from "../googleCalendar/oauth.js";
import { getClientById, setClientDriveFolders, type ClientRow } from "../../db/clients.js";
import type { VideoSubfolderKind } from "../../db/googleDrive.js";
import { findOrCreateFolder } from "./api.js";
import { getClientsRootFolder } from "./root.js";
import { ensureMonthFolder, ensureVideoSubfolder } from "./upload.js";

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

// Közös előfeltétel a lenti ensure-függvényekhez: Google-kapcsolat kell, és
// az ügyfél saját Drive-mappájának is léteznie kell (pótlólag létrehozva, ha
// még hiányzik). Null, ha bármelyik feltétel nem teljesül.
async function getReadyClient(clientId: number): Promise<{ oauth: OAuth2Client; client: ClientRow } | null> {
  const oauth = await getAuthorizedClient();
  if (!oauth) return null;

  let client = await getClientById(clientId);
  if (!client) return null;
  if (!client.drive_folder_id) {
    await provisionClientDriveFolders(client);
    client = await getClientById(clientId);
  }
  if (!client?.drive_folder_id) return null;
  return { oauth, client };
}

// Amikor egy tartalom "scriptre vár" állapotba kerül (létrehozáskor, kézzel
// vagy a naptár-szinkronból), a hozzá tartozó hónap-mappa (az adott tartalom
// forgatási dátuma szerinti hónap, vagy ha az még nincs megadva, a mai hónap)
// azonnal létrejöjjön — ne kelljen a napi provisioning-ra vagy az első
// nyersanyag-feltöltésre várni ahhoz, hogy a script dokumentum bekerülhessen.
// Szándékosan best-effort, mint a többi Drive-hívás.
export async function ensureContentItemMonthFolder(clientId: number, forDate: Date | string | null): Promise<void> {
  const ready = await getReadyClient(clientId);
  if (!ready) return;
  const yearMonth = (forDate ? new Date(forDate) : new Date()).toISOString().slice(0, 7);
  await ensureMonthFolder(ready.oauth, ready.client.id, ready.client.drive_folder_id!, yearMonth);
}

// Amikor egy tartalom "forgatásra vár"-ba (a "Nyersek" mappához) vagy
// "vágásra vár"-ba (a "Megvágva" mappához) kerül, a megfelelő almappa már
// előre létrejöjjön — a "Fájlok feltöltése" gomb ne az első kattintáskor
// hozza csak létre a célmappát.
export async function ensureContentItemVideoSubfolder(
  clientId: number,
  forDate: Date | string | null,
  kind: VideoSubfolderKind
): Promise<void> {
  const ready = await getReadyClient(clientId);
  if (!ready) return;
  const yearMonth = (forDate ? new Date(forDate) : new Date()).toISOString().slice(0, 7);
  await ensureVideoSubfolder(ready.oauth, ready.client.id, ready.client.drive_folder_id!, yearMonth, kind);
}
