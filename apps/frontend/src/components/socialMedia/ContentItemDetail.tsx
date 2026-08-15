import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../lib/auth";
import {
  CONTENT_STATUS_LABELS,
  PLATFORM_LABELS,
  getCardAction,
  getContentItem,
  listApprovals,
  sendReminder,
  toDatetimeLocalValue,
  transitionContentItem,
  updateContentItem,
  type Approval,
  type ContentItem,
} from "../../lib/socialMedia";

interface ContentItemDetailProps {
  itemId: number;
  onBack: () => void;
  onChanged: () => void;
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("hu-HU", { dateStyle: "medium", timeStyle: "short" });
}


export default function ContentItemDetail({ itemId, onBack, onChanged }: ContentItemDetailProps) {
  const { auth } = useAuth();
  const token = auth?.token ?? null;

  const [item, setItem] = useState<ContentItem | null>(null);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [scriptDraft, setScriptDraft] = useState("");
  const [editedUrlDraft, setEditedUrlDraft] = useState("");
  const [savingField, setSavingField] = useState(false);
  const [actionInputValue, setActionInputValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!token) return;
    Promise.all([getContentItem(token, itemId), listApprovals(token, itemId)]).then(([loadedItem, loadedApprovals]) => {
      setItem(loadedItem);
      setApprovals(loadedApprovals);
      setScriptDraft(loadedItem.script_content ?? "");
      setEditedUrlDraft(loadedItem.edited_media_url ?? "");
      // Ha a Google Naptár szinkron már ismeri az ügyfél következő
      // forgatását, azzal töltjük elő a dátum-mezőt (elfogadható vagy felülírható).
      if (
        loadedItem.status === "shoot_pending" &&
        loadedItem.client_next_shoot_date &&
        new Date(loadedItem.client_next_shoot_date).getTime() > Date.now()
      ) {
        setActionInputValue(toDatetimeLocalValue(loadedItem.client_next_shoot_date));
      }
    });
  }, [token, itemId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function saveScript() {
    if (!token || !item) return;
    setSavingField(true);
    try {
      const updated = await updateContentItem(token, item.id, {
        title: item.title,
        platform: item.platform,
        assignedTo: item.assigned_to ?? undefined,
        scriptContent: scriptDraft,
      });
      setItem(updated);
    } finally {
      setSavingField(false);
    }
  }

  async function saveEditedUrl() {
    if (!token || !item) return;
    setSavingField(true);
    try {
      const updated = await updateContentItem(token, item.id, {
        title: item.title,
        platform: item.platform,
        assignedTo: item.assigned_to ?? undefined,
        editedMediaUrl: editedUrlDraft,
      });
      setItem(updated);
    } finally {
      setSavingField(false);
    }
  }

  async function runAction(action: Parameters<typeof transitionContentItem>[2], payload?: Record<string, string>) {
    if (!token || !item) return;
    setBusy(true);
    setError(null);
    try {
      await transitionContentItem(token, item.id, action, payload);
      refresh();
      onChanged();
      setActionInputValue("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült végrehajtani a lépést");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemind(approval: Approval) {
    if (!token || !item) return;
    setBusy(true);
    setError(null);
    try {
      await sendReminder(token, item.id, approval.id);
      alert("Emlékeztető elküldve.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült elküldeni az emlékeztetőt");
    } finally {
      setBusy(false);
    }
  }

  if (!item) return <p className="chat-empty-hint">Betöltés...</p>;

  const cardAction = getCardAction(item.status);

  return (
    <div className="sm-detail">
      <button type="button" className="sm-detail-back" onClick={onBack}>
        ← Vissza
      </button>

      <h1>{item.title}</h1>
      <p className="sm-detail-sub">
        {item.client_name} · {PLATFORM_LABELS[item.platform]} · {item.assigned_to_name ?? "Nincs felelős kijelölve"}
      </p>
      <p className="sm-detail-status">Állapot: {CONTENT_STATUS_LABELS[item.status]}</p>

      {error && <p className="login-error">{error}</p>}

      <div className="sm-detail-action">
        {cardAction.kind === "forward" && !cardAction.input && (
          <button type="button" disabled={busy} onClick={() => runAction(cardAction.action)}>
            {cardAction.label}
          </button>
        )}
        {cardAction.kind === "forward" && cardAction.input && (
          <div className="sm-detail-action-form">
            <input
              type={cardAction.input === "rawMediaUrl" ? "text" : "datetime-local"}
              placeholder={cardAction.input === "rawMediaUrl" ? "https://..." : undefined}
              value={actionInputValue}
              onChange={(e) => setActionInputValue(e.currentTarget.value)}
            />
            <button
              type="button"
              disabled={busy || !actionInputValue.trim()}
              onClick={() =>
                runAction(cardAction.action, {
                  [cardAction.input === "shootDate"
                    ? "shootDate"
                    : cardAction.input === "rawMediaUrl"
                      ? "rawMediaUrl"
                      : "scheduledPublishAt"]: actionInputValue,
                })
              }
            >
              {cardAction.label}
            </button>
          </div>
        )}
        {cardAction.kind === "review" && (
          <div className="sm-detail-action-form">
            <button type="button" disabled={busy} onClick={() => runAction(cardAction.approveAction)}>
              Jóváhagyva
            </button>
            <input
              placeholder="Mit kell módosítani?"
              value={actionInputValue}
              onChange={(e) => setActionInputValue(e.currentTarget.value)}
            />
            <button
              type="button"
              disabled={busy || !actionInputValue.trim()}
              onClick={() => runAction(cardAction.rejectAction, { feedback: actionInputValue })}
            >
              Módosítás kell
            </button>
          </div>
        )}
        {cardAction.kind === "none" && <p className="chat-empty-hint">Ez a tartalom már közzétéve.</p>}
      </div>

      {(item.status === "script_writing" || item.script_content) && (
        <div className="sm-detail-field">
          <label htmlFor="sm-script">Script szövege</label>
          <textarea
            id="sm-script"
            rows={8}
            value={scriptDraft}
            onChange={(e) => setScriptDraft(e.currentTarget.value)}
            disabled={item.status !== "script_writing"}
          />
          {item.status === "script_writing" && (
            <button type="button" disabled={savingField} onClick={saveScript}>
              {savingField ? "Mentés..." : "Script mentése"}
            </button>
          )}
        </div>
      )}

      {item.raw_media_url && (
        <p className="sm-detail-field">
          <strong>Nyersanyag:</strong> <a href={item.raw_media_url} target="_blank" rel="noreferrer">{item.raw_media_url}</a>
        </p>
      )}

      {(item.status === "editing" || item.edited_media_url) && (
        <div className="sm-detail-field">
          <label htmlFor="sm-edited-url">Vágott anyag linkje</label>
          <input
            id="sm-edited-url"
            value={editedUrlDraft}
            onChange={(e) => setEditedUrlDraft(e.currentTarget.value)}
            disabled={item.status !== "editing"}
            placeholder="https://..."
          />
          {item.status === "editing" && (
            <button type="button" disabled={savingField} onClick={saveEditedUrl}>
              {savingField ? "Mentés..." : "Link mentése"}
            </button>
          )}
        </div>
      )}

      <div className="sm-detail-dates">
        <span>Forgatás: {formatDateTime(item.shoot_date)}</span>
        <span>Tervezett közzététel: {formatDateTime(item.scheduled_publish_at)}</span>
        <span>Közzétéve: {formatDateTime(item.published_at)}</span>
      </div>

      <h2>Jóváhagyási előzmények</h2>
      {approvals.length === 0 && <p className="chat-empty-hint">Még nem volt jóváhagyás-kérés.</p>}
      <ul className="sm-approval-history">
        {approvals.map((a) => (
          <li key={a.id} className={`sm-approval-history-item sm-approval-${a.status}`}>
            <div>
              <strong>{a.type === "script" ? "Script" : "Vágás"} v{a.version}</strong> —{" "}
              {a.status === "pending" ? "vár a jóváhagyásra" : a.status === "approved" ? "jóváhagyva" : "módosítást kértek"}
            </div>
            <div className="sm-approval-history-meta">
              Kiküldve: {formatDateTime(a.sent_at)}
              {a.decided_at && ` · Döntés: ${formatDateTime(a.decided_at)}`}
              {a.decided_by_name && ` · ${a.decided_by_name}`}
            </div>
            {a.feedback && <div className="sm-approval-feedback">„{a.feedback}"</div>}
            {a.status === "pending" && (
              <button type="button" disabled={busy} onClick={() => handleRemind(a)}>
                Emlékeztető küldése
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
