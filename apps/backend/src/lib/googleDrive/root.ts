import type { OAuth2Client } from "google-auth-library";
import { findOrCreateFolder, type DriveFolder } from "./api.js";

// Az app teljes Drive-tartalmának gyökere. Nincs rá gyorsítótár — ritkán
// hívott (onboarding, napi provisioning, a Social Media > Drive nézet), a
// findOrCreateFolder maga is csak egy keresés + esetleges létrehozás.
export async function getAppRootFolder(client: OAuth2Client): Promise<DriveFolder> {
  return findOrCreateFolder(client, null, "Runmate CRM");
}

// Minden ügyfélmappa ez alatt jön létre: "Runmate CRM/Ügyfelek/{cégnév}".
export async function getClientsRootFolder(client: OAuth2Client): Promise<DriveFolder> {
  const appRoot = await getAppRootFolder(client);
  return findOrCreateFolder(client, appRoot.id, "Ügyfelek");
}
