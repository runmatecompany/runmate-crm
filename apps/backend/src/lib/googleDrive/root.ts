import type { OAuth2Client } from "google-auth-library";
import { findOrCreateFolder, type DriveFolder } from "./api.js";

// Minden ügyfélmappa ez alatt jön létre: "Runmate CRM/Ügyfelek/{cégnév}".
// Nincs rá gyorsítótár — ritkán hívott (onboarding, napi provisioning), a
// findOrCreateFolder maga is csak egy keresés + esetleges létrehozás.
export async function getClientsRootFolder(client: OAuth2Client): Promise<DriveFolder> {
  const appRoot = await findOrCreateFolder(client, null, "Runmate CRM");
  return findOrCreateFolder(client, appRoot.id, "Ügyfelek");
}
