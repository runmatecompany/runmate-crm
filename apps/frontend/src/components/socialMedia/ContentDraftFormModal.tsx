import { useState, type FormEvent } from "react";
import { DRAFT_TYPE_LABELS, type DraftType } from "../../lib/contentDrafts";
import { PLATFORM_LABELS, type Platform } from "../../lib/socialMedia";
import { useEscapeToClose } from "../../lib/useEscapeToClose";

interface ContentDraftFormModalProps {
  clientName: string;
  onClose: () => void;
  onSave: (input: { type: DraftType; platform: Platform; title: string; topic?: string }) => Promise<void>;
}

const DRAFT_TYPES: DraftType[] = ["script", "caption", "image_concept", "carousel"];
const PLATFORM_OPTIONS: Platform[] = ["instagram", "tiktok", "youtube", "facebook"];

export default function ContentDraftFormModal({ clientName, onClose, onSave }: ContentDraftFormModalProps) {
  useEscapeToClose(onClose);
  const [type, setType] = useState<DraftType>("script");
  const [platform, setPlatform] = useState<Platform>("instagram");
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({ type, platform, title: title.trim(), topic: topic.trim() || undefined });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült létrehozni a tervet");
      setSaving(false);
    }
  }

  return (
    <div className="chat-modal-backdrop">
      <form className="chat-modal lead-form" onSubmit={handleSubmit}>
        <h2>Új terv — {clientName}</h2>

        <div className="lead-form-row">
          <div>
            <label htmlFor="draft-type">Típus</label>
            <select id="draft-type" value={type} onChange={(e) => setType(e.currentTarget.value as DraftType)}>
              {DRAFT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {DRAFT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="draft-platform">Platform</label>
            <select id="draft-platform" value={platform} onChange={(e) => setPlatform(e.currentTarget.value as Platform)}>
              {PLATFORM_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {PLATFORM_LABELS[p]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <label htmlFor="draft-title">Cím</label>
        <input id="draft-title" value={title} onChange={(e) => setTitle(e.currentTarget.value)} required autoFocus />

        <label htmlFor="draft-topic-input">Miről szóljon? (opcionális)</label>
        <input
          id="draft-topic-input"
          value={topic}
          onChange={(e) => setTopic(e.currentTarget.value)}
          placeholder="Pl. Új termék bemutatása"
        />

        {error && <p className="login-error">{error}</p>}

        <div className="chat-modal-actions">
          <button type="button" onClick={onClose} disabled={saving}>
            Mégse
          </button>
          <button type="submit" disabled={saving}>
            {saving ? "Létrehozás..." : "Létrehozás"}
          </button>
        </div>
      </form>
    </div>
  );
}
