import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../../lib/auth";
import { listClientContacts, type Client, type ClientContactInput, type ClientFormInput, type ClientType } from "../../lib/clients";
import { useEscapeToClose } from "../../lib/useEscapeToClose";

interface ClientFormModalProps {
  client: Client | null;
  onClose: () => void;
  onSave: (input: ClientFormInput) => Promise<void>;
}

interface ContactRow extends ClientContactInput {
  key: string;
}

let contactKeySeq = 0;
function newContactRow(): ContactRow {
  contactKeySeq += 1;
  return { key: `new-${contactKeySeq}`, name: "", email: "", phone: "" };
}

export default function ClientFormModal({ client, onClose, onSave }: ClientFormModalProps) {
  useEscapeToClose(onClose);
  const { auth } = useAuth();
  const [companyName, setCompanyName] = useState(client?.company_name ?? "");
  const [contactName, setContactName] = useState(client?.contact_name ?? "");
  const [phone, setPhone] = useState(client?.phone ?? "");
  const [email, setEmail] = useState(client?.email ?? "");
  const [address, setAddress] = useState(client?.address ?? "");
  const [notes, setNotes] = useState(client?.notes ?? "");
  const [clientType, setClientType] = useState<ClientType | "">(client?.client_type ?? "");
  const [billingName, setBillingName] = useState(client?.billing_name ?? "");
  const [taxNumber, setTaxNumber] = useState(client?.tax_number ?? "");
  const [billingAddress, setBillingAddress] = useState(client?.billing_address ?? "");
  const [bankAccount, setBankAccount] = useState(client?.bank_account ?? "");
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Új ügyfélnél még nincs kinek a kapcsolattartóit lekérni — a
  // "+ Új kapcsolattartó" gombbal onnantól kezdve fel lehet venni, a
  // mentés majd a UPDATE hívással együtt megy (lásd handleSubmit).
  useEffect(() => {
    if (!auth || !client) return;
    listClientContacts(auth.token, client.id).then((list) =>
      setContacts(list.map((c) => ({ key: `existing-${c.id}`, name: c.name, email: c.email ?? "", phone: c.phone ?? "" })))
    );
  }, [auth, client]);

  function addContactRow() {
    setContacts((prev) => [...prev, newContactRow()]);
  }

  function updateContactRow(key: string, patch: Partial<ClientContactInput>) {
    setContacts((prev) => prev.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  }

  function removeContactRow(key: string) {
    setContacts((prev) => prev.filter((c) => c.key !== key));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!companyName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({
        companyName: companyName.trim(),
        contactName: contactName.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        notes: notes.trim() || undefined,
        clientType: clientType || undefined,
        billingName: billingName.trim() || undefined,
        taxNumber: taxNumber.trim() || undefined,
        billingAddress: billingAddress.trim() || undefined,
        bankAccount: bankAccount.trim() || undefined,
        contacts: client
          ? contacts.filter((c) => c.name.trim()).map(({ name, email: cEmail, phone: cPhone }) => ({ name, email: cEmail, phone: cPhone }))
          : undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült menteni az ügyfelet");
      setSaving(false);
    }
  }

  return (
    <div className="chat-modal-backdrop">
      <form className="chat-modal lead-form client-form-modal" onSubmit={handleSubmit}>
        <h2>{client ? "Ügyfél szerkesztése" : "Új ügyfél"}</h2>

        <div className="lead-form-row">
          <div>
            <label htmlFor="client-company">Cégnév</label>
            <input
              id="client-company"
              value={companyName}
              onChange={(e) => setCompanyName(e.currentTarget.value)}
              required
              autoFocus
            />
          </div>
          <div>
            <label htmlFor="client-contact">Elsődleges kapcsolattartó</label>
            <input id="client-contact" value={contactName} onChange={(e) => setContactName(e.currentTarget.value)} />
          </div>
        </div>

        <div className="lead-form-row">
          <div>
            <label htmlFor="client-phone">Telefon</label>
            <input id="client-phone" value={phone} onChange={(e) => setPhone(e.currentTarget.value)} />
          </div>
          <div>
            <label htmlFor="client-email">Email</label>
            <input id="client-email" value={email} onChange={(e) => setEmail(e.currentTarget.value)} />
          </div>
        </div>

        <label htmlFor="client-address">Cím</label>
        <input id="client-address" value={address} onChange={(e) => setAddress(e.currentTarget.value)} />

        <label htmlFor="client-type">Ügyfél típusa</label>
        <select id="client-type" value={clientType} onChange={(e) => setClientType(e.currentTarget.value as ClientType | "")}>
          <option value="">— Nincs megadva —</option>
          <option value="monthly">Havi megújuló</option>
          <option value="one_off">Alkalmi</option>
        </select>

        <h3 className="client-form-section-title">Számlázási adatok</h3>
        <div className="lead-form-row">
          <div>
            <label htmlFor="client-billing-name">Számlázási név</label>
            <input
              id="client-billing-name"
              value={billingName}
              onChange={(e) => setBillingName(e.currentTarget.value)}
              placeholder="Ha eltér a cégnévtől"
            />
          </div>
          <div>
            <label htmlFor="client-tax-number">Adószám</label>
            <input id="client-tax-number" value={taxNumber} onChange={(e) => setTaxNumber(e.currentTarget.value)} />
          </div>
        </div>
        <label htmlFor="client-billing-address">Számlázási cím</label>
        <input
          id="client-billing-address"
          value={billingAddress}
          onChange={(e) => setBillingAddress(e.currentTarget.value)}
          placeholder="Ha eltér a fenti címtől"
        />
        <label htmlFor="client-bank-account">Bankszámlaszám</label>
        <input id="client-bank-account" value={bankAccount} onChange={(e) => setBankAccount(e.currentTarget.value)} />

        {client && (
          <>
            <h3 className="client-form-section-title">Kapcsolattartók</h3>
            <div className="client-contacts-list">
              {contacts.length === 0 && <p className="chat-empty-hint">Még nincs felvéve további kapcsolattartó.</p>}
              {contacts.map((c) => (
                <div key={c.key} className="client-contact-row">
                  <input
                    value={c.name}
                    onChange={(e) => updateContactRow(c.key, { name: e.currentTarget.value })}
                    placeholder="Név"
                  />
                  <input
                    value={c.email}
                    onChange={(e) => updateContactRow(c.key, { email: e.currentTarget.value })}
                    placeholder="Email"
                  />
                  <input
                    value={c.phone}
                    onChange={(e) => updateContactRow(c.key, { phone: e.currentTarget.value })}
                    placeholder="Telefon"
                  />
                  <button type="button" className="client-contact-remove" onClick={() => removeContactRow(c.key)}>
                    ×
                  </button>
                </div>
              ))}
            </div>
            <button type="button" className="client-contact-add" onClick={addContactRow}>
              + Új kapcsolattartó
            </button>
          </>
        )}

        <label htmlFor="client-notes">Jegyzet</label>
        <textarea
          id="client-notes"
          className="lead-notes-textarea"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.currentTarget.value)}
        />

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
