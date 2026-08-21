import { authFetch } from "./api";

export type SupportTicketStatus = "open" | "resolved";

export interface SupportTicket {
  id: number;
  body: string;
  status: SupportTicketStatus;
  created_by: number;
  created_by_name: string;
  created_at: string;
  resolved_by: number | null;
  resolved_by_name: string | null;
  resolved_at: string | null;
}

export interface SupportTicketsListResult {
  tickets: SupportTicket[];
  hasAccess: boolean;
}

// Bejelentkezett bárki elküldheti (modul-jogosultság nélkül is) — a
// footerben mindig elérhető gomb ezt hívja.
export async function submitSupportTicket(token: string, body: string): Promise<SupportTicket> {
  const res = await authFetch(token, "/support/tickets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "Nem sikerült elküldeni a jelzést");
  }
  const data = await res.json();
  return data.ticket;
}

export async function listSupportTickets(token: string): Promise<SupportTicketsListResult> {
  const res = await authFetch(token, "/support/tickets");
  return res.json();
}

export async function updateSupportTicketStatus(
  token: string,
  id: number,
  status: SupportTicketStatus
): Promise<SupportTicket> {
  const res = await authFetch(token, `/support/tickets/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  const data = await res.json();
  return data.ticket;
}
