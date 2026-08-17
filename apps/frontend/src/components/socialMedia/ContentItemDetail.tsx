import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { useAuth } from "../../lib/auth";
import {
  CONTENT_STATUS_LABELS,
  PLATFORM_LABELS,
  confirmContentItemPayment,
  generateScriptDraft,
  getCardAction,
  getContentItem,
  listApprovals,
  listContentItemEvents,
  sendReminder,
  toDatetimeLocalValue,
  transitionContentItem,
  updateContentItem,
  uploadEditedFiles,
  uploadRawFiles,
  type Approval,
  type ContentItem,
  type ContentItemEvent,
} from "../../lib/socialMedia";
import { getClientAiProfile, type ClientAiProfile } from "../../lib/clients";

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
  const isAdmin = auth?.user.role === "admin";

  const [item, setItem] = useState<ContentItem | null>(null);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [events, setEvents] = useState<ContentItemEvent[]>([]);
  const [scriptDraft, setScriptDraft] = useState("");
  const [shootDateDraft, setShootDateDraft] = useState("");
  const [savingField, setSavingField] = useState(false);
  const [actionInputValue, setActionInputValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [editedUploadProgress, setEditedUploadProgress] = useState<number | null>(null);
  const [aiProfile, setAiProfile] = useState<ClientAiProfile | null>(null);
  const [topicInput, setTopicInput] = useState("");
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editedFileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    if (!token) return;
    Promise.all([getContentItem(token, itemId), listApprovals(token, itemId), listContentItemEvents(token, itemId)]).then(
      ([loadedItem, loadedApprovals, loadedEvents]) => {
        setItem(loadedItem);
        setApprovals(loadedApprovals);
        setEvents(loadedEvents);
        setScriptDraft(loadedItem.script_content ?? "");
        setShootDateDraft(loadedItem.shoot_date ? toDatetimeLocalValue(loadedItem.shoot_date) : "");
      }
    );
  }, [token, itemId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Az AI-profilt csak akkor kérdezzük le, ha még script-írás alatt van a
  // tartalom — utána már nem releváns az emlékeztető panel.
  useEffect(() => {
    if (!token || !item || item.status !== "script_writing") return;
    getClientAiProfile(token, item.client_id).then(setAiProfile);
  }, [token, item?.client_id, item?.status]);

  async function handleGenerateDraft() {
    if (!token || !item || !topicInput.trim()) return;
    setGeneratingDraft(true);
    setError(null);
    try {
      const script = await generateScriptDraft(token, item.id, topicInput.trim());
      setScriptDraft(script);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült generálni a vázlatot");
    } finally {
      setGeneratingDraft(false);
    }
  }

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

  async function saveShootDate() {
    if (!token || !item || !shootDateDraft) return;
    setSavingField(true);
    try {
      const updated = await updateContentItem(token, item.id, {
        title: item.title,
        platform: item.platform,
        assignedTo: item.assigned_to ?? undefined,
        shootDate: new Date(shootDateDraft).toISOString(),
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

  async function handleFilesSelected(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.currentTarget.files ?? []);
    e.currentTarget.value = "";
    if (!token || !item || files.length === 0) return;
    setBusy(true);
    setError(null);
    setUploadProgress(0);
    try {
      await uploadRawFiles(token, item.id, files, setUploadProgress);
      refresh();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült feltölteni a fájlokat");
    } finally {
      setBusy(false);
      setUploadProgress(null);
    }
  }

  async function handleEditedFilesSelected(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.currentTarget.files ?? []);
    e.currentTarget.value = "";
    if (!token || !item || files.length === 0) return;
    setSavingField(true);
    setError(null);
    setEditedUploadProgress(0);
    try {
      const updated = await uploadEditedFiles(token, item.id, files, setEditedUploadProgress);
      setItem(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült feltölteni a fájlokat");
    } finally {
      setSavingField(false);
      setEditedUploadProgress(null);
    }
  }

  async function handleConfirmPayment() {
    if (!token || !item) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await confirmContentItemPayment(token, item.id);
      setItem(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült jóváhagyni a fizetést");
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

      {!item.payment_confirmed && (
        <div className="sm-detail-action sm-detail-action-payment">
          <p>🔒 A fizetés még nincs jóváhagyva — a munka nem indítható el ezen a tartalmon.</p>
          {isAdmin && (
            <button type="button" disabled={busy} onClick={handleConfirmPayment}>
              Fizetés jóváhagyása
            </button>
          )}
        </div>
      )}

      <div className="sm-detail-action" style={item.payment_confirmed ? undefined : { display: "none" }}>
        {cardAction.kind === "forward" && !cardAction.input && (
          <button type="button" disabled={busy} onClick={() => runAction(cardAction.action)}>
            {cardAction.label}
          </button>
        )}
        {cardAction.kind === "forward" && cardAction.action === "upload_raw" && (
          <div className="sm-detail-action-form">
            <input ref={fileInputRef} type="file" multiple hidden onChange={handleFilesSelected} />
            <button type="button" disabled={busy} onClick={() => fileInputRef.current?.click()}>
              {uploadProgress != null ? `Feltöltés... ${Math.round(uploadProgress * 100)}%` : "Fájlok feltöltése"}
            </button>
          </div>
        )}
        {cardAction.kind === "forward" && cardAction.input && cardAction.action !== "upload_raw" && (
          <div className="sm-detail-action-form">
            <input
              type="datetime-local"
              value={actionInputValue}
              onChange={(e) => setActionInputValue(e.currentTarget.value)}
            />
            <button
              type="button"
              disabled={busy || !actionInputValue.trim()}
              onClick={() => runAction(cardAction.action, { scheduledPublishAt: actionInputValue })}
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

      <div className="sm-detail-field">
        <label htmlFor="sm-shoot-date">Forgatás dátuma</label>
        <input
          id="sm-shoot-date"
          type="datetime-local"
          value={shootDateDraft}
          onChange={(e) => setShootDateDraft(e.currentTarget.value)}
        />
        <button type="button" disabled={savingField || !shootDateDraft} onClick={saveShootDate}>
          {savingField ? "Mentés..." : "Dátum mentése"}
        </button>
      </div>

      {item.status === "script_writing" && (
        <div className="sm-detail-field sm-ai-panel">
          {aiProfile &&
            (aiProfile.brand_voice || aiProfile.target_audience || aiProfile.visual_direction) && (
              <div className="sm-ai-profile-summary">
                <strong>Ügyfél AI-profil:</strong>
                {aiProfile.brand_voice && <p>Hangvétel: {aiProfile.brand_voice}</p>}
                {aiProfile.target_audience && <p>Célközönség: {aiProfile.target_audience}</p>}
                {aiProfile.visual_direction && <p>Vizuális irány: {aiProfile.visual_direction}</p>}
              </div>
            )}
          <label htmlFor="sm-ai-topic">Miről szóljon?</label>
          <input
            id="sm-ai-topic"
            value={topicInput}
            onChange={(e) => setTopicInput(e.currentTarget.value)}
            placeholder="Pl. Új termék bemutatása"
          />
          <button type="button" disabled={generatingDraft || !topicInput.trim()} onClick={handleGenerateDraft}>
            {generatingDraft ? "Generálás..." : "AI-vázlat generálása"}
          </button>
        </div>
      )}

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
          <label>Vágott anyag</label>
          {item.edited_media_url && (
            <p>
              <a href={item.edited_media_url} target="_blank" rel="noreferrer">{item.edited_media_url}</a>
            </p>
          )}
          {item.status === "editing" && item.payment_confirmed && (
            <div className="sm-detail-action-form">
              <input ref={editedFileInputRef} type="file" multiple hidden onChange={handleEditedFilesSelected} />
              <button type="button" disabled={savingField} onClick={() => editedFileInputRef.current?.click()}>
                {editedUploadProgress != null
                  ? `Feltöltés... ${Math.round(editedUploadProgress * 100)}%`
                  : "Fájlok feltöltése"}
              </button>
            </div>
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

      <h2>Munkatörténet</h2>
      {events.length === 0 && <p className="chat-empty-hint">Még nincs rögzített lépés.</p>}
      <ul className="sm-approval-history">
        {events.map((e) => (
          <li key={e.id} className="sm-approval-history-item">
            <div>
              {e.from_status ? CONTENT_STATUS_LABELS[e.from_status] : "Létrehozva"} →{" "}
              <strong>{CONTENT_STATUS_LABELS[e.to_status]}</strong>
            </div>
            <div className="sm-approval-history-meta">
              {formatDateTime(e.created_at)}
              {e.user_name && ` · ${e.user_name}`}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
