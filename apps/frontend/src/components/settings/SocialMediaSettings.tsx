import { useEffect, useState } from "react";
import { useAuth } from "../../lib/auth";
import { listAdminEmailAccounts, type EmailAccountAdminView } from "../../lib/email";
import { getSocialMediaSenderAccount, setSocialMediaSenderAccount } from "../../lib/socialMedia";

export default function SocialMediaSettings() {
  const { auth } = useAuth();
  const [accounts, setAccounts] = useState<EmailAccountAdminView[]>([]);
  const [senderAccountId, setSenderAccountIdState] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState(false);

  useEffect(() => {
    if (!auth) return;
    Promise.all([listAdminEmailAccounts(auth.token), getSocialMediaSenderAccount(auth.token)]).then(
      ([accountList, current]) => {
        setAccounts(accountList);
        setSenderAccountIdState(current);
        setLoading(false);
      }
    );
  }, [auth]);

  async function handleSave() {
    if (!auth) return;
    setSaving(true);
    setSavedMessage(false);
    try {
      await setSocialMediaSenderAccount(auth.token, senderAccountId);
      setSavedMessage(true);
      setTimeout(() => setSavedMessage(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="social-media-settings">
      <h2>Social Media</h2>
      <p className="chat-modal-hint">
        Ez a fiók küldi ki a jóváhagyás-kérő és emlékeztető emaileket az ügyfeleknek a Social Media modulban.
      </p>

      {loading && <p className="chat-empty-hint">Betöltés...</p>}

      {!loading && accounts.length === 0 && (
        <p className="chat-empty-hint">Nincs még felvett email fiók — előbb vegyél fel egyet az Email fiókok alatt.</p>
      )}

      {!loading && accounts.length > 0 && (
        <>
          <label htmlFor="sm-sender-account">Küldő fiók</label>
          <select
            id="sm-sender-account"
            value={senderAccountId ?? ""}
            onChange={(e) => setSenderAccountIdState(e.currentTarget.value === "" ? null : Number(e.currentTarget.value))}
          >
            <option value="">Nincs kijelölve</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.display_name} ({a.from_address})
              </option>
            ))}
          </select>

          <div className="chat-modal-actions">
            {savedMessage && <span className="chat-empty-hint">Mentve.</span>}
            <button type="button" onClick={handleSave} disabled={saving}>
              {saving ? "Mentés..." : "Mentés"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
