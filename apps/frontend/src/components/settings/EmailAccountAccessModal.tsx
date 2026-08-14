import { useEffect, useState } from "react";
import { useAuth } from "../../lib/auth";
import { listColleagues, type Colleague } from "../../lib/chat";
import { getEmailAccountAccess, setEmailAccountAccess, type EmailAccountAdminView } from "../../lib/email";

interface EmailAccountAccessModalProps {
  account: EmailAccountAdminView;
  onClose: () => void;
}

export default function EmailAccountAccessModal({ account, onClose }: EmailAccountAccessModalProps) {
  const { auth } = useAuth();
  const [colleagues, setColleagues] = useState<Colleague[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth) return;
    Promise.all([listColleagues(auth.token), getEmailAccountAccess(auth.token, account.id)]).then(
      ([colleagueList, userIds]) => {
        setColleagues(colleagueList);
        setSelected(new Set(userIds));
        setLoading(false);
      }
    );
  }, [auth, account.id]);

  function toggle(userId: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  }

  async function handleSave() {
    if (!auth) return;
    setSaving(true);
    setError(null);
    try {
      await setEmailAccountAccess(auth.token, account.id, Array.from(selected));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült menteni a hozzáféréseket");
      setSaving(false);
    }
  }

  return (
    <div className="chat-modal-backdrop" onClick={onClose}>
      <div className="chat-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Hozzáférés kezelése</h2>
        <p className="chat-modal-hint">
          Akiket kijelölsz, azok automatikusan látni fogják ezt a fiókot ({account.display_name}) az Üzenetek
          oldalon, bejelentkezés nélkül. Az adminisztrátorok minden fiókhoz automatikusan hozzáférnek, rájuk nem
          vonatkozik ez a lista.
        </p>
        <div className="chat-member-picker">
          {loading && <p className="chat-empty-hint">Betöltés...</p>}
          {!loading && colleagues.length === 0 && <p className="chat-empty-hint">Nincs más kolléga még.</p>}
          {!loading &&
            colleagues.map((c) => (
              <label key={c.id} className="chat-colleague-pick email-account-access-option">
                <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                {c.name} <span className="chat-member-email">({c.email})</span>
              </label>
            ))}
        </div>
        {error && <p className="login-error">{error}</p>}
        <div className="chat-modal-actions">
          <button type="button" onClick={onClose} disabled={saving}>
            Mégse
          </button>
          <button type="button" onClick={handleSave} disabled={saving || loading}>
            {saving ? "Mentés..." : "Mentés"}
          </button>
        </div>
      </div>
    </div>
  );
}
