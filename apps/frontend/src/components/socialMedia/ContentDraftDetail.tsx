import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../lib/auth";
import { getClientAiProfile, type ClientAiProfile } from "../../lib/clients";
import {
  DRAFT_TYPE_LABELS,
  deleteContentDraft,
  generateDraftContent,
  getContentDraft,
  saveDraftToDrive,
  updateContentDraft,
  type ContentDraft,
} from "../../lib/contentDrafts";
import { PLATFORM_LABELS } from "../../lib/socialMedia";

interface ContentDraftDetailProps {
  draftId: number;
  onBack: () => void;
  onChanged: () => void;
}

export default function ContentDraftDetail({ draftId, onBack, onChanged }: ContentDraftDetailProps) {
  const { auth } = useAuth();
  const token = auth?.token ?? null;

  const [draft, setDraft] = useState<ContentDraft | null>(null);
  const [aiProfile, setAiProfile] = useState<ClientAiProfile | null>(null);
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [contentText, setContentText] = useState("");
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [savingToDrive, setSavingToDrive] = useState(false);
  const [driveLink, setDriveLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!token) return;
    getContentDraft(token, draftId).then((loaded) => {
      setDraft(loaded);
      setTitle(loaded.title);
      setTopic(loaded.topic ?? "");
      setContentText(loaded.content_text ?? "");
      getClientAiProfile(token, loaded.client_id).then(setAiProfile);
    });
  }, [token, draftId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleSave() {
    if (!token || !draft) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateContentDraft(token, draft.id, { title, topic, contentText });
      setDraft(updated);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült menteni a tervet");
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerate() {
    if (!token || !draft || !topic.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const generated = await generateDraftContent(token, draft.id, topic.trim());
      setContentText(generated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült generálni a vázlatot");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSaveToDrive() {
    if (!token || !draft) return;
    setSavingToDrive(true);
    setError(null);
    setDriveLink(null);
    try {
      // Előbb mentsük a legfrissebb szöveget, hogy a Drive-ra pontosan az
      // kerüljön, amit a felhasználó épp lát/szerkesztett.
      const updated = await updateContentDraft(token, draft.id, { title, topic, contentText });
      setDraft(updated);
      const result = await saveDraftToDrive(token, draft.id);
      setDraft(result.draft);
      setDriveLink(result.driveLink);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült menteni a Drive-ra");
    } finally {
      setSavingToDrive(false);
    }
  }

  async function handleDelete() {
    if (!token || !draft) return;
    if (!confirm(`Biztosan törlöd a(z) "${draft.title}" tervet?`)) return;
    await deleteContentDraft(token, draft.id);
    onChanged();
    onBack();
  }

  if (!draft) return <p className="chat-empty-hint">Betöltés...</p>;

  return (
    <div className="sm-detail">
      <button type="button" className="sm-detail-back" onClick={onBack}>
        ← Vissza
      </button>

      <h1>{draft.title}</h1>
      <p className="sm-detail-sub">
        {draft.client_name} · {DRAFT_TYPE_LABELS[draft.type]} · {PLATFORM_LABELS[draft.platform]}
      </p>

      {error && <p className="login-error">{error}</p>}

      <div className="sm-detail-field">
        <label htmlFor="draft-title">Cím</label>
        <input id="draft-title" value={title} onChange={(e) => setTitle(e.currentTarget.value)} />
      </div>

      <div className="sm-detail-field sm-ai-panel">
        {aiProfile && (aiProfile.brand_voice || aiProfile.target_audience || aiProfile.visual_direction) && (
          <div className="sm-ai-profile-summary">
            <strong>Ügyfél AI-profil:</strong>
            {aiProfile.brand_voice && <p>Hangvétel: {aiProfile.brand_voice}</p>}
            {aiProfile.target_audience && <p>Célközönség: {aiProfile.target_audience}</p>}
            {aiProfile.visual_direction && <p>Vizuális irány: {aiProfile.visual_direction}</p>}
          </div>
        )}
        <label htmlFor="draft-topic">Miről szóljon?</label>
        <input
          id="draft-topic"
          value={topic}
          onChange={(e) => setTopic(e.currentTarget.value)}
          placeholder="Pl. Új termék bemutatása"
        />
        <button type="button" disabled={generating || !topic.trim()} onClick={handleGenerate}>
          {generating ? "Generálás..." : "AI-vázlat generálása"}
        </button>
      </div>

      <div className="sm-detail-field">
        <label htmlFor="draft-content">Tartalom</label>
        <textarea id="draft-content" rows={12} value={contentText} onChange={(e) => setContentText(e.currentTarget.value)} />
        <button type="button" disabled={saving} onClick={handleSave}>
          {saving ? "Mentés..." : "Mentés"}
        </button>
      </div>

      <div className="sm-detail-field">
        <button type="button" disabled={savingToDrive || !contentText.trim()} onClick={handleSaveToDrive}>
          {savingToDrive ? "Mentés Drive-ra..." : "Mentés Drive-ra"}
        </button>
        {driveLink && (
          <p>
            <a href={driveLink} target="_blank" rel="noreferrer">
              Megnyitás a Drive-on
            </a>
          </p>
        )}
        {!driveLink && draft.drive_file_id && (
          <p className="chat-empty-hint">Korábban már mentve a Drive-ra.</p>
        )}
      </div>

      <div className="sm-detail-field">
        <button type="button" onClick={handleDelete}>
          Terv törlése
        </button>
      </div>
    </div>
  );
}
