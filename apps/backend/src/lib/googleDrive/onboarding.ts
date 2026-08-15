import { getAuthorizedClient } from "../googleCalendar/oauth.js";
import { setClientDriveFolders, type ClientRow } from "../../db/clients.js";
import { findOrCreateFolder } from "./api.js";

// Ügyfél-onboardingkor (kézi létrehozás vagy Lead → Ügyfél konverzió) hívva.
// Szándékosan best-effort: ha nincs Google-kapcsolat, vagy a Drive-hívás
// hibázik, ne akassza meg magát az ügyfél létrehozását — a hívó fél elkapja
// és csak logolja a hibát, a mappalánc később pótolható.
export async function provisionClientDriveFolders(client: ClientRow): Promise<void> {
  const oauth = await getAuthorizedClient();
  if (!oauth) return; // nincs Google-kapcsolat, kihagyjuk

  const clientFolder = await findOrCreateFolder(oauth, null, client.company_name);
  const shootsFolder = await findOrCreateFolder(oauth, clientFolder.id, "Forgatások");
  const rawFolder = await findOrCreateFolder(oauth, shootsFolder.id, "Nyers fájlok");

  await setClientDriveFolders(client.id, { driveFolderId: clientFolder.id, driveRawFolderId: rawFolder.id });
}
