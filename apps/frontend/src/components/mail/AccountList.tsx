import type { EmailAccountSummary } from "../../lib/email";

interface AccountListProps {
  accounts: EmailAccountSummary[];
  activeAccountId: number | null;
  onSelect: (id: number) => void;
}

export default function AccountList({ accounts, activeAccountId, onSelect }: AccountListProps) {
  return (
    <aside className="mail-account-list">
      <div className="chat-room-list-header">
        <span>Fiókok</span>
      </div>
      {accounts.length === 0 && (
        <p className="chat-empty-hint">Nincs még hozzáférésed egyetlen email fiókhoz sem.</p>
      )}
      {accounts.map((account) => (
        <button
          key={account.id}
          type="button"
          className={account.id === activeAccountId ? "mail-account-item active" : "mail-account-item"}
          onClick={() => onSelect(account.id)}
        >
          <span className="mail-account-name">{account.display_name}</span>
          <span className="mail-account-address">{account.from_address}</span>
        </button>
      ))}
    </aside>
  );
}
