import type { OAuth2Client } from "google-auth-library";
import { findOrCreateFolder, type DriveFolder } from "./api.js";

// Ez a két mappa a folyamat teljes élettartama alatt gyakorlatilag állandó
// — a beépített Drive-böngésző minden mappanyitáskor hívja őket, ezért
// memóriában gyorsítótárazzuk (nem kell minden lapozáshoz 2 API-hívással
// újra feloldani), csak az első sikeres híváskor kerülnek ide.
let cachedAppRoot: DriveFolder | null = null;
let cachedClientsRoot: DriveFolder | null = null;

export async function getAppRootFolder(client: OAuth2Client): Promise<DriveFolder> {
  if (cachedAppRoot) return cachedAppRoot;
  const folder = await findOrCreateFolder(client, null, "Runmate CRM");
  cachedAppRoot = folder;
  return folder;
}

// Minden ügyfélmappa ez alatt jön létre: "Runmate CRM/Ügyfelek/{cégnév}".
export async function getClientsRootFolder(client: OAuth2Client): Promise<DriveFolder> {
  if (cachedClientsRoot) return cachedClientsRoot;
  const appRoot = await getAppRootFolder(client);
  const folder = await findOrCreateFolder(client, appRoot.id, "Ügyfelek");
  cachedClientsRoot = folder;
  return folder;
}
