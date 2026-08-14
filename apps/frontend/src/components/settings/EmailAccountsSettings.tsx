import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../lib/auth";
import {
  createEmailAccount,
  deleteEmailAccount,
  listAdminEmailAccounts,
  updateEmailAccount,
  type EmailAccountAdminView,
  type EmailAccountFormInput,
} from "../../lib/email";
import EmailAccountFormModal from "./EmailAccountFormModal";

export default function EmailAccountsSettings() {
  const { auth } = useAuth();
  const [accounts, setAccounts] = useState<EmailAccountAdminView[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingAccount, setEditingAccount] = useState<EmailAccountAdminView | null | "new">(null);

  const refresh = useCallback(() => {
    if (!auth) return;
    setLoading(true);
    listAdminEmailAccounts(auth.token)
      .then(setAccounts)
      .finally(() => setLoading(false));
  }, [auth]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleSave(input: EmailAccountFormInput & { isActive: boolean }) {
    if (!auth) return;
    if (editingAccount && editingAccount !== "new") {
      await updateEmailAccount(auth.token, editingAccount.id, input);
    } else {
      await createEmailAccount(auth.token, input);
    }
    setEditingAccount(null);
    refresh();
  }

  async function handleDelete(account: EmailAccountAdminView) {
    if (!auth) return;
    if (!confirm(`Biztosan törlöd a(z) "${account.display_name}" email fiókot?`)) return;
    await deleteEmailAccount(auth.token, account.id);
    refresh();
  }

  return (
    <div className="email-accounts-settings">
      <div className="email-accounts-header">
        <h1>Email fiókok</h1>
        <button type="button" onClick={() => setEditingAccount("new")}>
          + Új fiók
        </button>
      </div>
      <p className="chat-modal-hint">
        Az itt felvett fiókokhoz a hozzáférést a Beállítások &gt; Profilok oldalon, felhasználónként kezelheted.
      </p>

      {loading && <p className="chat-empty-hint">Betöltés...</p>}
      {!loading && accounts.length === 0 && <p className="chat-empty-hint">Még nincs felvéve email fiók.</p>}

      <ul className="email-accounts-list">
        {accounts.map((account) => (
          <li key={account.id} className="email-account-row">
            <div className="email-account-row-info">
              <span className="email-account-row-name">
                {account.display_name}
                {!account.is_active && <span className="email-account-inactive-badge">inaktív</span>}
              </span>
              <span className="email-account-row-address">{account.from_address}</span>
            </div>
            <div className="email-account-row-actions">
              <button type="button" onClick={() => setEditingAccount(account)}>
                Szerkesztés
              </button>
              <button type="button" onClick={() => handleDelete(account)}>
                Törlés
              </button>
            </div>
          </li>
        ))}
      </ul>

      {editingAccount && (
        <EmailAccountFormModal
          account={editingAccount === "new" ? null : editingAccount}
          onClose={() => setEditingAccount(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
