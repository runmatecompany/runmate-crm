import { useState, type FormEvent } from "react";
import { useAuth } from "../../lib/auth";
import { useEscapeToClose } from "../../lib/useEscapeToClose";
import {
  testEmailAccountConnection,
  type EmailAccountAdminView,
  type EmailAccountFormInput,
  type MailSecurity,
} from "../../lib/email";

interface EmailAccountFormModalProps {
  account: EmailAccountAdminView | null;
  onClose: () => void;
  onSave: (input: EmailAccountFormInput & { isActive: boolean }) => Promise<void>;
}

const SECURITY_OPTIONS: { value: MailSecurity; label: string }[] = [
  { value: "tls", label: "TLS/SSL (pl. 465-ös/993-as port)" },
  { value: "starttls", label: "STARTTLS (pl. 587-es port)" },
  { value: "none", label: "Titkosítás nélkül" },
];

export default function EmailAccountFormModal({ account, onClose, onSave }: EmailAccountFormModalProps) {
  useEscapeToClose(onClose);
  const { auth } = useAuth();
  const [displayName, setDisplayName] = useState(account?.display_name ?? "");
  const [fromName, setFromName] = useState(account?.from_name ?? "");
  const [fromAddress, setFromAddress] = useState(account?.from_address ?? "");
  const [imapHost, setImapHost] = useState(account?.imap_host ?? "");
  const [imapPort, setImapPort] = useState(account?.imap_port ?? 993);
  const [imapSecurity, setImapSecurity] = useState<MailSecurity>(account?.imap_security ?? "tls");
  const [imapUsername, setImapUsername] = useState(account?.imap_username ?? "");
  const [imapPassword, setImapPassword] = useState("");
  const [smtpHost, setSmtpHost] = useState(account?.smtp_host ?? "");
  const [smtpPort, setSmtpPort] = useState(account?.smtp_port ?? 587);
  const [smtpSecurity, setSmtpSecurity] = useState<MailSecurity>(account?.smtp_security ?? "starttls");
  const [smtpUsername, setSmtpUsername] = useState(account?.smtp_username ?? "");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [isActive, setIsActive] = useState(account?.is_active ?? true);

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ imap: string; smtp: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleTestConnection() {
    if (!auth) return;
    setTesting(true);
    setTestResult(null);
    setError(null);
    try {
      const result = await testEmailAccountConnection(auth.token, {
        accountId: account?.id,
        imap: { host: imapHost, port: imapPort, security: imapSecurity, username: imapUsername, password: imapPassword || undefined },
        smtp: { host: smtpHost, port: smtpPort, security: smtpSecurity, username: smtpUsername, password: smtpPassword || undefined },
      });
      setTestResult({
        imap: result.imap.ok ? "Sikeres kapcsolódás" : `Hiba: ${result.imap.error}`,
        smtp: result.smtp.ok ? "Sikeres kapcsolódás" : `Hiba: ${result.smtp.error}`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült tesztelni a kapcsolatot");
    } finally {
      setTesting(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave({
        displayName: displayName.trim(),
        fromName: fromName.trim(),
        fromAddress: fromAddress.trim(),
        imapHost: imapHost.trim(),
        imapPort,
        imapSecurity,
        imapUsername: imapUsername.trim(),
        imapPassword: imapPassword || undefined,
        smtpHost: smtpHost.trim(),
        smtpPort,
        smtpSecurity,
        smtpUsername: smtpUsername.trim(),
        smtpPassword: smtpPassword || undefined,
        isActive,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült menteni a fiókot");
      setSaving(false);
    }
  }

  return (
    <div className="chat-modal-backdrop">
      <form className="chat-modal email-account-form" onSubmit={handleSubmit}>
        <h2>{account ? "Email fiók szerkesztése" : "Új email fiók"}</h2>

        <label htmlFor="ea-display-name">Megjelenített név (belső, csak neked)</label>
        <input id="ea-display-name" value={displayName} onChange={(e) => setDisplayName(e.currentTarget.value)} required autoFocus />

        <div className="email-account-form-row">
          <div>
            <label htmlFor="ea-from-name">Feladó neve</label>
            <input id="ea-from-name" value={fromName} onChange={(e) => setFromName(e.currentTarget.value)} required />
          </div>
          <div>
            <label htmlFor="ea-from-address">Feladó email címe</label>
            <input
              id="ea-from-address"
              type="email"
              value={fromAddress}
              onChange={(e) => setFromAddress(e.currentTarget.value)}
              required
            />
          </div>
        </div>

        <h3>Bejövő levelek (IMAP)</h3>
        <div className="email-account-form-row">
          <div>
            <label htmlFor="ea-imap-host">Szerver</label>
            <input id="ea-imap-host" value={imapHost} onChange={(e) => setImapHost(e.currentTarget.value)} required />
          </div>
          <div className="email-account-form-port">
            <label htmlFor="ea-imap-port">Port</label>
            <input
              id="ea-imap-port"
              type="number"
              value={imapPort}
              onChange={(e) => setImapPort(Number(e.currentTarget.value))}
              required
            />
          </div>
        </div>
        <label htmlFor="ea-imap-security">Titkosítás</label>
        <select id="ea-imap-security" value={imapSecurity} onChange={(e) => setImapSecurity(e.currentTarget.value as MailSecurity)}>
          {SECURITY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <div className="email-account-form-row">
          <div>
            <label htmlFor="ea-imap-username">Felhasználónév</label>
            <input id="ea-imap-username" value={imapUsername} onChange={(e) => setImapUsername(e.currentTarget.value)} required />
          </div>
          <div>
            <label htmlFor="ea-imap-password">Jelszó{account ? " (üresen hagyva marad a régi)" : ""}</label>
            <input
              id="ea-imap-password"
              type="password"
              value={imapPassword}
              onChange={(e) => setImapPassword(e.currentTarget.value)}
              required={!account}
            />
          </div>
        </div>

        <h3>Kimenő levelek (SMTP)</h3>
        <div className="email-account-form-row">
          <div>
            <label htmlFor="ea-smtp-host">Szerver</label>
            <input id="ea-smtp-host" value={smtpHost} onChange={(e) => setSmtpHost(e.currentTarget.value)} required />
          </div>
          <div className="email-account-form-port">
            <label htmlFor="ea-smtp-port">Port</label>
            <input
              id="ea-smtp-port"
              type="number"
              value={smtpPort}
              onChange={(e) => setSmtpPort(Number(e.currentTarget.value))}
              required
            />
          </div>
        </div>
        <label htmlFor="ea-smtp-security">Titkosítás</label>
        <select id="ea-smtp-security" value={smtpSecurity} onChange={(e) => setSmtpSecurity(e.currentTarget.value as MailSecurity)}>
          {SECURITY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <div className="email-account-form-row">
          <div>
            <label htmlFor="ea-smtp-username">Felhasználónév</label>
            <input id="ea-smtp-username" value={smtpUsername} onChange={(e) => setSmtpUsername(e.currentTarget.value)} required />
          </div>
          <div>
            <label htmlFor="ea-smtp-password">Jelszó{account ? " (üresen hagyva marad a régi)" : ""}</label>
            <input
              id="ea-smtp-password"
              type="password"
              value={smtpPassword}
              onChange={(e) => setSmtpPassword(e.currentTarget.value)}
              required={!account}
            />
          </div>
        </div>

        {account && (
          <label className="email-account-active-toggle">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.currentTarget.checked)} />
            Aktív fiók
          </label>
        )}

        <div className="email-account-test-row">
          <button type="button" onClick={handleTestConnection} disabled={testing}>
            {testing ? "Tesztelés..." : "Kapcsolat tesztelése"}
          </button>
          {testResult && (
            <div className="email-account-test-result">
              <span className={testResult.imap.startsWith("Hiba") ? "error" : "ok"}>IMAP: {testResult.imap}</span>
              <span className={testResult.smtp.startsWith("Hiba") ? "error" : "ok"}>SMTP: {testResult.smtp}</span>
            </div>
          )}
        </div>

        {error && <p className="login-error">{error}</p>}

        <div className="chat-modal-actions">
          <button type="button" onClick={onClose} disabled={saving}>
            Mégse
          </button>
          <button type="submit" disabled={saving}>
            {saving ? "Mentés..." : "Mentés"}
          </button>
        </div>
      </form>
    </div>
  );
}
