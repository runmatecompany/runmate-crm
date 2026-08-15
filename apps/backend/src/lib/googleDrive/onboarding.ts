import { getAuthorizedClient } from "../googleCalendar/oauth.js";
import { setClientDriveFolders, type ClientRow } from "../../db/clients.js";
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
