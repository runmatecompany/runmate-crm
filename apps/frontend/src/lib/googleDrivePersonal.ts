import { authFetch } from "./api";

export interface PersonalGoogleDriveStatus {
  connected: boolean;
  connectedEmail: string | null;
}

export async function getPersonalGoogleDriveStatus(token: string): Promise<PersonalGoogleDriveStatus> {
  const res = await authFetch(token, "/me/google-drive/status");
  return res.json();
}

export async function getPersonalGoogleDriveAuthUrl(token: string): Promise<string> {
  const res = await authFetch(token, "/me/google-drive/auth-url");
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Nem sikerült elindítani a kapcsolódást");
  }
  const data = await res.json();
  return data.url;
}

export async function disconnectPersonalGoogleDrive(token: string): Promise<void> {
  await authFetch(token, "/me/google-drive/disconnect", { method: "POST" });
}
