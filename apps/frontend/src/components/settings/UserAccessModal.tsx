import { useEffect, useState } from "react";
import { useAuth } from "../../lib/auth";
import type { Colleague } from "../../lib/chat";
import { listAdminEmailAccounts, type EmailAccountAdminView } from "../../lib/email";
import { getUserAccess, setUserAccess } from "../../lib/userAccess";
import { useEscapeToClose } from "../../lib/useEscapeToClose";
import { menuItemLabel } from "../../lib/menuItems";

interface UserAccessModalProps {
  user: Colleague;
  onClose: () => void;
}

export default function UserAccessModal({ user, onClose }: UserAccessModalProps) {
  useEscapeToClose(onClose);
  const { auth } = useAuth();
  const [accounts, setAccounts] = useState<EmailAccountAdminView[]>([]);
  const [leadsAccess, setLeadsAccessState] = useState(false);
  const [clientsAccess, setClientsAccessState] = useState(false);
  const [socialMediaAccess, setSocialMediaAccessState] = useState(false);
  const [tasksAccess, setTasksAccessState] = useState(false);
  const [leadGenAccess, setLeadGenAccessState] = useState(false);
  const [webAccess, setWebAccessState] = useState(false);
  const [supportAccess, setSupportAccessState] = useState(false);
  const [emailModuleAccess, setEmailModuleAccessState] = useState(false);
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth) return;
    Promise.all([listAdminEmailAccounts(auth.token), getUserAccess(auth.token, user.id)]).then(
      ([accountList, access]) => {
        setAccounts(accountList);
        setLeadsAccessState(access.leadsAccess);
        setClientsAccessState(access.clientsAccess);
        setSocialMediaAccessState(access.socialMediaAccess);
        setTasksAccessState(access.tasksAccess);
        setLeadGenAccessState(access.leadGenAccess);
        setWebAccessState(access.webAccess);
        setSupportAccessState(access.supportAccess);
        setEmailModuleAccessState(access.emailModuleAccess);
        setSelectedAccountIds(new Set(access.emailAccountIds));
        setLoading(false);
      }
    );
  }, [auth, user.id]);

  function toggleAccount(id: number) {
    setSelectedAccountIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleSave() {
    if (!auth) return;
    setSaving(true);
    setError(null);
    try {
      await setUserAccess(auth.token, user.id, {
        leadsAccess,
        clientsAccess,
        socialMediaAccess,
        tasksAccess,
        leadGenAccess,
        webAccess,
        supportAccess,
        emailModuleAccess,
        emailAccountIds: Array.from(selectedAccountIds),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült menteni a jogosultságokat");
      setSaving(false);
    }
  }

  return (
    <div className="chat-modal-backdrop">
      <div className="chat-modal">
        <h2>{user.name} jogosultságai</h2>
        <p className="chat-modal-hint">
          Az első pipa dönti el, hogy az adott modul egyáltalán megjelenjen-e {user.name} számára. Ha a modulnak
          több eleme van, azok almenüpontként, alább választhatók ki.
        </p>

        {loading && <p className="chat-empty-hint">Betöltés...</p>}

        {!loading && (
          <div className="chat-member-picker">
            <label className="chat-colleague-pick email-account-access-option user-access-module">
              <input
                type="checkbox"
                checked={leadsAccess}
                onChange={(e) => setLeadsAccessState(e.currentTarget.checked)}
              />
              {menuItemLabel("leads", "Leadek")} modul
            </label>

            <label className="chat-colleague-pick email-account-access-option user-access-module">
              <input
                type="checkbox"
                checked={clientsAccess}
                onChange={(e) => setClientsAccessState(e.currentTarget.checked)}
              />
              {menuItemLabel("clients", "Ügyfelek")} modul
            </label>

            <label className="chat-colleague-pick email-account-access-option user-access-module">
              <input
                type="checkbox"
                checked={socialMediaAccess}
                onChange={(e) => setSocialMediaAccessState(e.currentTarget.checked)}
              />
              {menuItemLabel("social", "Social Media")} modul
            </label>

            <label className="chat-colleague-pick email-account-access-option user-access-module">
              <input
                type="checkbox"
                checked={tasksAccess}
                onChange={(e) => setTasksAccessState(e.currentTarget.checked)}
              />
              {menuItemLabel("tasks", "Feladatok")} modul
            </label>

            <label className="chat-colleague-pick email-account-access-option user-access-module">
              <input
                type="checkbox"
                checked={leadGenAccess}
                onChange={(e) => setLeadGenAccessState(e.currentTarget.checked)}
              />
              {menuItemLabel("leadgen", "Lead Gen")} modul
            </label>

            <label className="chat-colleague-pick email-account-access-option user-access-module">
              <input
                type="checkbox"
                checked={webAccess}
                onChange={(e) => setWebAccessState(e.currentTarget.checked)}
              />
              {menuItemLabel("web", "Web")} modul
            </label>

            <label className="chat-colleague-pick email-account-access-option user-access-module">
              <input
                type="checkbox"
                checked={supportAccess}
                onChange={(e) => setSupportAccessState(e.currentTarget.checked)}
              />
              {menuItemLabel("support", "Support")} modul
            </label>

            <label className="chat-colleague-pick email-account-access-option user-access-module">
              <input
                type="checkbox"
                checked={emailModuleAccess}
                onChange={(e) => setEmailModuleAccessState(e.currentTarget.checked)}
              />
              {menuItemLabel("messages", "Email")} modul
            </label>
            <div className="user-access-submenu">
              {accounts.length === 0 && <p className="chat-empty-hint">Nincs még email fiók felvéve.</p>}
              {accounts.map((account) => (
                <label
                  key={account.id}
                  className={
                    emailModuleAccess
                      ? "chat-colleague-pick email-account-access-option"
                      : "chat-colleague-pick email-account-access-option disabled"
                  }
                >
                  <input
                    type="checkbox"
                    checked={selectedAccountIds.has(account.id)}
                    onChange={() => toggleAccount(account.id)}
                    disabled={!emailModuleAccess}
                  />
                  {account.display_name}
                </label>
              ))}
            </div>
          </div>
        )}

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
