import type { OAuth2Client } from "google-auth-library";
import { findOrCreateFolder, folderExists, type DriveFolder } from "./api.js";

// Ez a két mappa a folyamat teljes élettartama alatt gyakorlatilag állandó
// — a beépített Drive-böngésző minden mappanyitáskor hívja őket, ezért
// memóriában gyorsítótárazzuk (nem kell minden lapozáshoz 2 API-hívással
// újra feloldani). A gyorsítótárazott azonosítót viszont mindig
// ellenőrizzük (folderExists), mielőtt megbíznánk benne — ha valaki kézzel
// törölte/áthelyezte a mappát a Drive-on, a szerver ezt a folyamat teljes
// hátralévő élettartamára (akár napokra/hetekre, ez éles szerver) észre
// sem venné máskülönben, és minden ez alá tartozó böngészés/feltöltés
// elavult állapotot mutatna, amíg valaki újra nem indítja a szervert.
let cachedAppRoot: DriveFolder | null = null;
let cachedClientsRoot: DriveFolder | null = null;

export async function getAppRootFolder(client: OAuth2Client): Promise<DriveFolder> {
  if (cachedAppRoot && (await folderExists(client, cachedAppRoot.id))) return cachedAppRoot;
  const folder = await findOrCreateFolder(client, null, "Runmate CRM");
  cachedAppRoot = folder;
  return folder;
}

// Minden ügyfélmappa ez alatt jön létre: "Runmate CRM/Ügyfelek/{cégnév}".
export async function getClientsRootFolder(client: OAuth2Client): Promise<DriveFolder> {
  if (cachedClientsRoot && (await folderExists(client, cachedClientsRoot.id))) return cachedClientsRoot;
  const appRoot = await getAppRootFolder(client);
  const folder = await findOrCreateFolder(client, appRoot.id, "Ügyfelek");
  cachedClientsRoot = folder;
  return folder;
}
