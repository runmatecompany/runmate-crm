import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../lib/auth";
import { listPendingApprovals, sendReminder, type PendingApproval } from "../../lib/socialMedia";

const STALE_DAYS = 3;

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

interface ApprovalQueueViewProps {
  onOpen: (itemId: number) => void;
}

export default function ApprovalQueueView({ onOpen }: ApprovalQueueViewProps) {
  const { auth } = useAuth();
  const token = auth?.token ?? null;
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingId, setSendingId] = useState<number | null>(null);

  const refresh = useCallback(() => {
    if (!token) return;
    setLoading(true);
    listPendingApprovals(token)
      .then(setApprovals)
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleRemind(approval: PendingApproval) {
    if (!token) return;
    setSendingId(approval.id);
    try {
      await sendReminder(token, approval.content_item_id, approval.id);
      alert("Emlékeztető elküldve.");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Nem sikerült elküldeni az emlékeztetőt");
    } finally {
      setSendingId(null);
    }
  }

  if (loading) return <p className="chat-empty-hint">Betöltés...</p>;
  if (approvals.length === 0) return <p className="chat-empty-hint">Nincs jóváhagyásra váró tartalom.</p>;

  return (
    <table className="leads-table">
      <thead>
        <tr>
          <th>Ügyfél</th>
          <th>Tartalom</th>
          <th>Típus</th>
          <th>Verzió</th>
          <th>Hány napja vár</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {approvals.map((a) => {
          const days = daysSince(a.sent_at);
          return (
            <tr key={a.id} className={days >= STALE_DAYS ? "sm-queue-row-stale" : undefined}>
              <td>{a.client_name}</td>
              <td>
                <button type="button" className="sm-queue-open" onClick={() => onOpen(a.content_item_id)}>
                  {a.content_title}
                </button>
              </td>
              <td>{a.type === "script" ? "Script" : "Vágás"}</td>
              <td>v{a.version}</td>
              <td>{days === 0 ? "ma" : `${days} napja`}</td>
              <td>
                <button type="button" disabled={sendingId === a.id} onClick={() => handleRemind(a)}>
                  {sendingId === a.id ? "Küldés..." : "Emlékeztető küldése"}
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
