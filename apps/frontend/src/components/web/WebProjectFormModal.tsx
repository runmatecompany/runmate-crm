import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../../lib/auth";
import { listColleagues, type Colleague } from "../../lib/chat";
import type { WebProject, WebProjectInput } from "../../lib/webProjects";
import { useEscapeToClose } from "../../lib/useEscapeToClose";

const TYPE_LABELS = { website: "Weboldal", landing_page: "Landing oldal" } as const;

interface WebProjectFormModalProps {
  project: WebProject;
  onClose: () => void;
  onSave: (input: WebProjectInput) => Promise<void>;
}

// Kézi "+ Új projekt" nincs — a projektek automatikusan jönnek létre,
// amikor az onboardingban bejelölik a Weboldal/Landing szolgáltatást
// (lásd db/clientOnboarding.ts). Ez a form ezért kizárólag szerkesztésre
// való — az ügyfél és a típus rögzített, csak a felelős/URL/jegyzet
// módosítható.
export default function WebProjectFormModal({ project, onClose, onSave }: WebProjectFormModalProps) {
  useEscapeToClose(onClose);
  const { auth } = useAuth();
  const token = auth?.token ?? null;

  const [colleagues, setColleagues] = useState<Colleague[]>([]);
  const [title, setTitle] = useState(project.title);
  const [liveUrl, setLiveUrl] = useState(project.live_url ?? "");
  const [notes, setNotes] = useState(project.notes ?? "");
  const [assignedTo, setAssignedTo] = useState<number | "">(project.assigned_to ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    listColleagues(token).then(setColleagues);
  }, [token]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({
        title: title.trim(),
        projectType: project.project_type,
        clientId: project.client_id,
        liveUrl: liveUrl.trim() || undefined,
        notes: notes.trim() || undefined,
        assignedTo: assignedTo === "" ? undefined : assignedTo,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült menteni a projektet");
      setSaving(false);
    }
  }

  return (
    <div className="chat-modal-backdrop">
      <form className="chat-modal lead-form" onSubmit={handleSubmit}>
        <h2>Web projekt szerkesztése</h2>
        <p className="chat-empty-hint">
          {project.client_name} · {TYPE_LABELS[project.project_type]}
        </p>

        <label htmlFor="wp-title">Projekt neve</label>
        <input
          id="wp-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
          autoFocus
          required
        />

        <label htmlFor="wp-assignee">Felelős</label>
        <select
          id="wp-assignee"
          value={assignedTo}
          onChange={(e) => setAssignedTo(e.currentTarget.value ? Number(e.currentTarget.value) : "")}
        >
          <option value="">— Még nincs kiosztva —</option>
          {colleagues.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <label htmlFor="wp-live-url">Élő URL</label>
        <input
          id="wp-live-url"
          type="text"
          value={liveUrl}
          onChange={(e) => setLiveUrl(e.currentTarget.value)}
          placeholder="https://... (ha már élesben van)"
        />

        <label htmlFor="wp-notes">Jegyzet</label>
        <textarea
          id="wp-notes"
          rows={4}
          value={notes}
          onChange={(e) => setNotes(e.currentTarget.value)}
          placeholder="Részletek, elvárások, állapot..."
        />

        {error && <p className="login-error">{error}</p>}

        <div className="chat-modal-actions">
          <button type="button" onClick={onClose} disabled={saving}>
            Mégse
          </button>
          <button type="submit" disabled={saving || !title.trim()}>
            {saving ? "Mentés..." : "Mentés"}
          </button>
        </div>
      </form>
    </div>
  );
}
