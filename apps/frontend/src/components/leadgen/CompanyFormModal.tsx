import { useState, type FormEvent } from "react";
import { useAuth } from "../../lib/auth";
import {
  createLeadGenCompany,
  updateLeadGenCompany,
  type LeadGenCompany,
  type LeadGenCompanyInput,
  type LeadGenPhoneType,
  type LeadGenSocialAssessment,
} from "../../lib/leadgen";
import { useEscapeToClose } from "../../lib/useEscapeToClose";

interface CompanyFormModalProps {
  company?: LeadGenCompany;
  onClose: () => void;
  onSaved: () => void;
}

const PHONE_TYPE_OPTIONS: { value: LeadGenPhoneType; label: string }[] = [
  { value: "direct_dm", label: "Közvetlen döntéshozói szám" },
  { value: "central", label: "Központi szám" },
  { value: "contact_form", label: "Csak kontaktűrlap" },
];

const SOCIAL_OPTIONS: { value: LeadGenSocialAssessment; label: string }[] = [
  { value: "active_good", label: "Aktív és profi" },
  { value: "active_weak", label: "Aktív, de gyenge" },
  { value: "stale", label: "Ritkán frissül" },
  { value: "very_weak", label: "Nagyon gyenge" },
  { value: "none", label: "Nincs jelenlét" },
];

export default function CompanyFormModal({ company, onClose, onSaved }: CompanyFormModalProps) {
  useEscapeToClose(onClose);
  const { auth } = useAuth();
  const token = auth?.token ?? null;

  const [companyName, setCompanyName] = useState(company?.company_name ?? "");
  const [taxNumber, setTaxNumber] = useState(company?.tax_number ?? "");
  const [industry, setIndustry] = useState(company?.industry ?? "");
  const [address, setAddress] = useState(company?.address ?? "");
  const [city, setCity] = useState(company?.city ?? "");
  const [county, setCounty] = useState(company?.county ?? "");
  const [website, setWebsite] = useState(company?.website ?? "");
  const [phoneMain, setPhoneMain] = useState(company?.phone_main ?? "");
  const [phoneSource, setPhoneSource] = useState(company?.phone_source ?? "");
  const [phoneType, setPhoneType] = useState<LeadGenPhoneType | "">(company?.phone_type ?? "");
  const [revenueCurrent, setRevenueCurrent] = useState(company?.revenue_current ?? "");
  const [revenueYear, setRevenueYear] = useState(company?.revenue_year != null ? String(company.revenue_year) : "");
  const [revenueSource, setRevenueSource] = useState(company?.revenue_source ?? "");
  const [employeeCount, setEmployeeCount] = useState(company?.employee_count != null ? String(company.employee_count) : "");
  const [socialAssessment, setSocialAssessment] = useState<LeadGenSocialAssessment | "">(company?.social_assessment ?? "");
  const [adRunning, setAdRunning] = useState(company?.ad_running ?? false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token || !companyName.trim()) return;
    setSaving(true);
    setError(null);
    const input: LeadGenCompanyInput = {
      companyName: companyName.trim(),
      taxNumber: taxNumber.trim() || undefined,
      industry: industry.trim() || undefined,
      address: address.trim() || undefined,
      city: city.trim() || undefined,
      county: county.trim() || undefined,
      website: website.trim() || undefined,
      phoneMain: phoneMain.trim() || undefined,
      phoneSource: phoneSource.trim() || undefined,
      phoneType: phoneType || undefined,
      revenueCurrent: revenueCurrent ? Number(revenueCurrent) : undefined,
      revenueYear: revenueYear ? Number(revenueYear) : undefined,
      revenueSource: revenueSource.trim() || undefined,
      employeeCount: employeeCount ? Number(employeeCount) : undefined,
      socialAssessment: socialAssessment || undefined,
      adRunning,
    };
    try {
      if (company) {
        await updateLeadGenCompany(token, company.id, input);
      } else {
        await createLeadGenCompany(token, input);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült menteni a céget");
      setSaving(false);
    }
  }

  return (
    <div className="chat-modal-backdrop">
      <form className="chat-modal lead-form" onSubmit={handleSubmit}>
        <h2>{company ? "Cég szerkesztése" : "Új cég"}</h2>

        <label htmlFor="lg-name">Cégnév</label>
        <input id="lg-name" value={companyName} onChange={(e) => setCompanyName(e.currentTarget.value)} autoFocus required />

        <div className="lead-form-row">
          <div>
            <label htmlFor="lg-tax">Adószám</label>
            <input id="lg-tax" value={taxNumber} onChange={(e) => setTaxNumber(e.currentTarget.value)} />
          </div>
          <div>
            <label htmlFor="lg-industry">Iparág</label>
            <input id="lg-industry" value={industry} onChange={(e) => setIndustry(e.currentTarget.value)} />
          </div>
        </div>

        <label htmlFor="lg-address">Cím</label>
        <input id="lg-address" value={address} onChange={(e) => setAddress(e.currentTarget.value)} />

        <div className="lead-form-row">
          <div>
            <label htmlFor="lg-city">Város</label>
            <input id="lg-city" value={city} onChange={(e) => setCity(e.currentTarget.value)} />
          </div>
          <div>
            <label htmlFor="lg-county">Megye</label>
            <input id="lg-county" value={county} onChange={(e) => setCounty(e.currentTarget.value)} />
          </div>
        </div>

        <label htmlFor="lg-website">Weboldal</label>
        <input id="lg-website" value={website} onChange={(e) => setWebsite(e.currentTarget.value)} placeholder="https://..." />

        <label htmlFor="lg-phone">Telefonszám</label>
        <input id="lg-phone" value={phoneMain} onChange={(e) => setPhoneMain(e.currentTarget.value)} placeholder="+36 1 234 5678" />

        <div className="lead-form-row">
          <div>
            <label htmlFor="lg-phone-source">Telefonszám forrása</label>
            <input id="lg-phone-source" value={phoneSource} onChange={(e) => setPhoneSource(e.currentTarget.value)} placeholder="pl. weboldalról" />
          </div>
          <div>
            <label htmlFor="lg-phone-type">Telefonszám típusa</label>
            <select id="lg-phone-type" value={phoneType} onChange={(e) => setPhoneType(e.currentTarget.value as LeadGenPhoneType)}>
              <option value="">Válassz...</option>
              {PHONE_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="lead-form-row">
          <div>
            <label htmlFor="lg-revenue">Árbevétel (Ft)</label>
            <input id="lg-revenue" type="number" value={revenueCurrent} onChange={(e) => setRevenueCurrent(e.currentTarget.value)} />
          </div>
          <div>
            <label htmlFor="lg-revenue-year">Árbevétel éve</label>
            <input id="lg-revenue-year" type="number" value={revenueYear} onChange={(e) => setRevenueYear(e.currentTarget.value)} />
          </div>
        </div>
        <label htmlFor="lg-revenue-source">Árbevétel forrása</label>
        <input
          id="lg-revenue-source"
          value={revenueSource}
          onChange={(e) => setRevenueSource(e.currentTarget.value)}
          placeholder="pl. e-beszámoló portál — ha üres, a pontozás nem veszi figyelembe"
        />

        <div className="lead-form-row">
          <div>
            <label htmlFor="lg-employees">Létszám</label>
            <input id="lg-employees" type="number" value={employeeCount} onChange={(e) => setEmployeeCount(e.currentTarget.value)} />
          </div>
          <div>
            <label htmlFor="lg-social">Social jelenlét</label>
            <select id="lg-social" value={socialAssessment} onChange={(e) => setSocialAssessment(e.currentTarget.value as LeadGenSocialAssessment)}>
              <option value="">Nincs felmérve</option>
              {SOCIAL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        <label className="ai-profile-checkbox">
          <input type="checkbox" checked={adRunning} onChange={(e) => setAdRunning(e.currentTarget.checked)} />
          Jelenleg fut Meta/Google hirdetése
        </label>

        {error && <p className="login-error">{error}</p>}

        <div className="chat-modal-actions">
          <button type="button" onClick={onClose} disabled={saving}>
            Mégse
          </button>
          <button type="submit" disabled={saving || !companyName.trim()}>
            {saving ? "Mentés..." : "Mentés"}
          </button>
        </div>
      </form>
    </div>
  );
}
