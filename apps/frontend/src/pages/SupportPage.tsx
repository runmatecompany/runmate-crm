import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { listSupportTickets, updateSupportTicketStatus, type SupportTicket } from "../lib/support";
import Avatar from "../components/Avatar";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("hu-HU", { dateStyle: "medium", timeStyle: "short" });
}

// Csak nálam (ezen a gépen, ezzel a felhasználóval) tűnjön el egy megoldott
// jelzés — nem törlődik, csak a saját listámból rejtem el, hogy ne
// gyűljenek fel felesleges régi kártyák.
function dismissedKey(userId: number): string {
  return `runmate-dismissed-support-${userId}`;
}

function loadDismissed(userId: number): Set<number> {
  try {
    const raw = localStorage.getItem(dismissedKey(userId));
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

export default function SupportPage() {
  const { auth } = useAuth();
  const token = auth?.token ?? null;

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [hasAccess, setHasAccess] = useState(true);
  const [loading, setLoading] = useState(true);
  const [openTicket, setOpenTicket] = useState<SupportTicket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<number>>(() =>
    auth ? loadDismissed(auth.user.id) : new Set()
  );

  function handleDismiss(ticketId: number) {
    if (!auth) return;
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.add(ticketId);
      try {
        localStorage.setItem(dismissedKey(auth.user.id), JSON.stringify(Array.from(next)));
      } catch {
        // localStorage nem elérhető — a rejtés csak ebben a munkamenetben marad meg
      }
      return next;
    });
  }

  const refresh = useCallback(() => {
    if (!token) return;
    setLoading(true);
    listSupportTickets(token)
      .then((result) => {
        setTickets(result.tickets);
        setHasAccess(result.hasAccess);
      })
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleToggleStatus(ticket: SupportTicket) {
    if (!token) return;
    setError(null);
    try {
      const nextStatus = ticket.status === "open" ? "resolved" : "open";
      const updated = await updateSupportTicketStatus(token, ticket.id, nextStatus);
      setTickets((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setOpenTicket((prev) => (prev && prev.id === updated.id ? updated : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült frissíteni az állapotot");
    }
  }

  if (!loading && !hasAccess) {
    return (
      <main className="leads-page">
        <h1>Support</h1>
        <p className="chat-empty-hint">
          Nincs hozzáférésed a Support modulhoz. Kérj hozzáférést egy adminisztrátortól.
        </p>
      </main>
    );
  }

  const openTickets = tickets.filter((t) => t.status === "open");
  const resolvedTickets = tickets.filter((t) => t.status === "resolved" && !dismissedIds.has(t.id));

  function renderCard(ticket: SupportTicket) {
    const preview = ticket.body.length > 140 ? `${ticket.body.slice(0, 140)}...` : ticket.body;
    return (
      <div
        key={ticket.id}
        role="button"
        tabIndex={0}
        className="support-ticket-card"
        onClick={() => setOpenTicket(ticket)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpenTicket(ticket);
          }
        }}
      >
        <Avatar userId={ticket.created_by} name={ticket.created_by_name} size={32} />
        <div className="support-ticket-card-body">
          <div className="support-ticket-card-meta">
            <span className="support-ticket-card-author">{ticket.created_by_name}</span>
            <span className="support-ticket-card-date">{formatDate(ticket.created_at)}</span>
          </div>
          <div className="support-ticket-card-preview">{preview}</div>
        </div>
        {ticket.status === "resolved" && (
          <button
            type="button"
            className="support-ticket-dismiss"
            title="Elrejtés a listából"
            onClick={(e) => {
              e.stopPropagation();
              handleDismiss(ticket.id);
            }}
          >
            ×
          </button>
        )}
      </div>
    );
  }

  return (
    <main className="leads-page">
      <div className="leads-header">
        <h1>Support</h1>
      </div>

      {error && <p className="login-error">{error}</p>}
      {loading && <p className="chat-empty-hint">Betöltés...</p>}

      {!loading && tickets.length === 0 && (
        <p className="chat-empty-hint">Még nem érkezett support-jelzés.</p>
      )}

      {!loading && tickets.length > 0 && (
        <>
          <h2 className="sm-section-title">Nyitva ({openTickets.length})</h2>
          {openTickets.length === 0 ? (
            <p className="chat-empty-hint">Nincs nyitott jelzés.</p>
          ) : (
            <div className="support-ticket-list">{openTickets.map(renderCard)}</div>
          )}

          <h2 className="sm-section-title">Megoldva ({resolvedTickets.length})</h2>
          {resolvedTickets.length === 0 ? (
            <p className="chat-empty-hint">Még nincs megoldott jelzés.</p>
          ) : (
            <div className="support-ticket-list">{resolvedTickets.map(renderCard)}</div>
          )}
        </>
      )}

      {openTicket && (
        <div className="chat-modal-backdrop" onClick={() => setOpenTicket(null)}>
          <div className="chat-modal support-ticket-modal" onClick={(e) => e.stopPropagation()}>
            <div className="support-ticket-modal-header">
              <Avatar userId={openTicket.created_by} name={openTicket.created_by_name} size={36} />
              <div>
                <div className="support-ticket-card-author">{openTicket.created_by_name}</div>
                <div className="support-ticket-card-date">{formatDate(openTicket.created_at)}</div>
              </div>
            </div>
            <p className="support-ticket-modal-body">{openTicket.body}</p>
            {openTicket.status === "resolved" && openTicket.resolved_by_name && (
              <p className="chat-modal-hint">
                Megoldva: {openTicket.resolved_by_name}
                {openTicket.resolved_at ? ` — ${formatDate(openTicket.resolved_at)}` : ""}
              </p>
            )}
            <div className="chat-modal-actions">
              <button type="button" onClick={() => setOpenTicket(null)}>
                Bezárás
              </button>
              <button type="button" onClick={() => handleToggleStatus(openTicket)}>
                {openTicket.status === "open" ? "Megjelölés megoldottként" : "Újranyitás"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
