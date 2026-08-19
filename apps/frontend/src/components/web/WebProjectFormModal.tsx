import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "../../lib/auth";
import { listColleagues, type Colleague } from "../../lib/chat";
import { listClients, type Client } from "../../lib/clients";
import type { WebProject, WebProjectInput, WebProjectType } from "../../lib/webProjects";
import { useEscapeToClose } from "../../lib/useEscapeToClose";

interface WebProjectFormModalProps {
  project?: WebProject;
  onClose: () => void;
  onSave: (input: WebProjectInput) => Promise<void>;
}

export default function WebProjectFormModal({ project, onClose, onSave }: WebProjectFormModalProps) {
  useEscapeToClose(onClose);
  const { auth } = useAuth();
  const token = auth?.token ?? null;

  const [clients, setClients] = useState<Client[]>([]);
  const [colleagues, setColleagues] = useState<Colleague[]>([]);
  const [title, setTitle] = useState(project?.title ?? "");
  const [projectType, setProjectType] = useState<WebProjectType>(project?.project_type ?? "website");
  const [clientId, setClientId] = useState<number | "">(project?.client_id ?? "");
  const [liveUrl, setLiveUrl] = useState(project?.live_url ?? "");
  const [notes, setNotes] = useState(project?.notes ?? "");
  const [assignedTo, setAssignedTo] = useState<number | "">(project?.assigned_to ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    listClients(token).then((result) => setClients(result.clients));
    listColleagues(token).then(setColleagues);
  }, [token]);

  // Csak azok az ügyfelek választhatók, akiknek ténylegesen van weboldal
  // vagy landing oldal szolgáltatásuk az onboardingban — ugyanaz az elv,
  // mint a Social Media modul ügyfél-szűrésénél.
  const webClients = useMemo(
    () => clients.filter((c) => c.service_website_build || c.service_landing_page),
    [clients]
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || clientId === "") return;
    setSaving(true);
    setError(null);
    try {
      await onSave({
        title: title.trim(),
        projectType,
        clientId,
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
        <h2>{project ? "Web projekt szerkesztése" : "Új web projekt"}</h2>

        <label htmlFor="wp-title">Projekt neve</label>
        <input
          id="wp-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
          placeholder="Pl. Új céges weboldal"
          autoFocus
          required
        />

        <label htmlFor="wp-type">Típus</label>
        <select id="wp-type" value={projectType} onChange={(e) => setProjectType(e.currentTarget.value as WebProjectType)}>
          <option value="website">Weboldal</option>
          <option value="landing_page">Landing oldal</option>
        </select>

        <label htmlFor="wp-client">Ügyfél</label>
        <select
          id="wp-client"
          value={clientId}
          onChange={(e) => setClientId(e.currentTarget.value ? Number(e.currentTarget.value) : "")}
          required
        >
          <option value="">— Válassz ügyfelet —</option>
          {webClients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.company_name}
            </option>
          ))}
        </select>
        {webClients.length === 0 && (
          <p className="chat-empty-hint">
            Nincs olyan ügyfél, akinek weboldal vagy landing oldal szolgáltatása lenne az onboardingban.
          </p>
        )}

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
          <button type="submit" disabled={saving || !title.trim() || clientId === ""}>
            {saving ? "Mentés..." : "Mentés"}
          </button>
        </div>
      </form>
    </div>
  );
}
