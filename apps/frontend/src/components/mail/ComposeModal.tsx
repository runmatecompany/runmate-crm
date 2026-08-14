import { useState, type FormEvent } from "react";

export interface ComposeInitial {
  to?: string;
  subject?: string;
  body?: string;
  inReplyToUid?: number;
  inReplyToFolder?: string;
}

export interface ComposeSendInput {
  to: string[];
  subject: string;
  text: string;
  inReplyToUid?: number;
  inReplyToFolder?: string;
}

interface ComposeModalProps {
  initial: ComposeInitial;
  onClose: () => void;
  onSend: (input: ComposeSendInput) => Promise<void>;
}

export default function ComposeModal({ initial, onClose, onSend }: ComposeModalProps) {
  const [to, setTo] = useState(initial.to ?? "");
  const [subject, setSubject] = useState(initial.subject ?? "");
  const [body, setBody] = useState(initial.body ?? "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const toList = to
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (toList.length === 0 || !subject.trim() || !body.trim()) return;

    setSending(true);
    setError(null);
    try {
      await onSend({
        to: toList,
        subject: subject.trim(),
        text: body,
        inReplyToUid: initial.inReplyToUid,
        inReplyToFolder: initial.inReplyToFolder,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült elküldeni a levelet");
      setSending(false);
    }
  }

  return (
    <div className="chat-modal-backdrop" onClick={onClose}>
      <form className="chat-modal mail-compose-modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2>{initial.inReplyToUid ? "Válasz" : "Új levél"}</h2>

        <label htmlFor="mail-to">Címzett</label>
        <input
          id="mail-to"
          value={to}
          onChange={(e) => setTo(e.currentTarget.value)}
          placeholder="pelda@ceg.hu, masik@ceg.hu"
          required
          autoFocus
        />

        <label htmlFor="mail-subject">Tárgy</label>
        <input id="mail-subject" value={subject} onChange={(e) => setSubject(e.currentTarget.value)} required />

        <label htmlFor="mail-body">Üzenet</label>
        <textarea
          id="mail-body"
          className="mail-compose-body"
          value={body}
          onChange={(e) => setBody(e.currentTarget.value)}
          rows={10}
          required
        />

        {error && <p className="login-error">{error}</p>}

        <div className="chat-modal-actions">
          <button type="button" onClick={onClose} disabled={sending}>
            Mégse
          </button>
          <button type="submit" disabled={sending}>
            {sending ? "Küldés..." : "Küldés"}
          </button>
        </div>
      </form>
    </div>
  );
}
