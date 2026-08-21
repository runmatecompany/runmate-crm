import { useState, type FormEvent } from "react";
import { useAuth } from "../../lib/auth";
import { submitSupportTicket } from "../../lib/support";
import { useEscapeToClose } from "../../lib/useEscapeToClose";

interface SupportRequestModalProps {
  onClose: () => void;
}

export default function SupportRequestModal({ onClose }: SupportRequestModalProps) {
  useEscapeToClose(onClose);
  const { auth } = useAuth();
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!auth || !body.trim()) return;
    setSending(true);
    setError(null);
    try {
      await submitSupportTicket(auth.token, body.trim());
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült elküldeni a jelzést");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="chat-modal-backdrop">
      <form className="chat-modal support-request-modal" onSubmit={handleSubmit}>
        <h2>Support</h2>

        {sent ? (
          <>
            <p className="chat-modal-hint">Köszönjük, elküldve!</p>
            <div className="chat-modal-actions">
              <button type="button" onClick={onClose}>
                Bezárás
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="chat-modal-hint">
              Írd le, ha hibát vagy hiányosságot találtál, valami akadályoz a munkában, vagy szükséged lenne egy
              új funkcióra. A neved és a beküldés időpontja automatikusan csatolva lesz.
            </p>
            <label htmlFor="support-body">Mi a jelzésed?</label>
            <textarea
              id="support-body"
              className="support-request-textarea"
              value={body}
              onChange={(e) => setBody(e.currentTarget.value)}
              placeholder="Írd le részletesen, mit tapasztaltál, vagy mire lenne szükséged..."
              required
              autoFocus
            />

            {error && <p className="login-error">{error}</p>}

            <div className="chat-modal-actions">
              <button type="button" onClick={onClose} disabled={sending}>
                Mégse
              </button>
              <button type="submit" disabled={sending || !body.trim()}>
                {sending ? "Küldés..." : "Küldés"}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
