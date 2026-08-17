import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../../lib/auth";
import { listColleagues, type Colleague } from "../../lib/chat";
import { listClients, type Client } from "../../lib/clients";
import type { ManualTask, ManualTaskInput } from "../../lib/tasks";
import { useEscapeToClose } from "../../lib/useEscapeToClose";

interface ManualTaskFormModalProps {
  task?: ManualTask;
  onClose: () => void;
  onSave: (input: ManualTaskInput) => Promise<void>;
}

export default function ManualTaskFormModal({ task, onClose, onSave }: ManualTaskFormModalProps) {
  useEscapeToClose(onClose);
  const { auth } = useAuth();
  const token = auth?.token ?? null;

  const [clients, setClients] = useState<Client[]>([]);
  const [colleagues, setColleagues] = useState<Colleague[]>([]);
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [clientId, setClientId] = useState<number | "">(task?.client_id ?? "");
  const [assignedTo, setAssignedTo] = useState<number | "">(task?.assigned_to ?? "");
  const [dueDate, setDueDate] = useState(task?.due_date ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    listClients(token).then((result) => setClients(result.clients));
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
        description: description.trim() || undefined,
        clientId: clientId === "" ? undefined : clientId,
        assignedTo: assignedTo === "" ? undefined : assignedTo,
        dueDate: dueDate || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült menteni a feladatot");
      setSaving(false);
    }
  }

  return (
    <div className="chat-modal-backdrop">
      <form className="chat-modal lead-form" onSubmit={handleSubmit}>
        <h2>{task ? "Feladat szerkesztése" : "Új feladat"}</h2>

        <label htmlFor="mt-title">Feladat</label>
        <input
          id="mt-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
          placeholder="pl. Social media profilnevek egységesítése"
          autoFocus
          required
        />

        <label htmlFor="mt-description">Leírás</label>
        <textarea
          id="mt-description"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
          placeholder="Részletek, kontextus, amit a feladatot elvégző kollégának tudnia kell..."
        />

        <label htmlFor="mt-client">Ügyfél</label>
        <select id="mt-client" value={clientId} onChange={(e) => setClientId(e.currentTarget.value ? Number(e.currentTarget.value) : "")}>
          <option value="">— Nincs konkrét ügyfélhez kötve —</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.company_name}
            </option>
          ))}
        </select>

        <label htmlFor="mt-assignee">Felelős</label>
        <select
          id="mt-assignee"
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

        <label htmlFor="mt-due">Határidő</label>
        <input id="mt-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.currentTarget.value)} />

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
