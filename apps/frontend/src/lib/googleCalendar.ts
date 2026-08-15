import { authFetch } from "./api";

export interface GoogleCalendarStatus {
  connected: boolean;
  connectedEmail: string | null;
  lastSyncedAt: string | null;
}

export async function getGoogleCalendarStatus(token: string): Promise<GoogleCalendarStatus> {
  const res = await authFetch(token, "/admin/google-calendar/status");
  return res.json();
}

export async function getGoogleCalendarAuthUrl(token: string): Promise<string> {
  const res = await authFetch(token, "/admin/google-calendar/auth-url");
  const data = await res.json();
  return data.url;
}

export async function disconnectGoogleCalendar(token: string): Promise<void> {
  await authFetch(token, "/admin/google-calendar/disconnect", { method: "POST" });
}
