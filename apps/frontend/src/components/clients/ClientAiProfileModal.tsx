import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../../lib/auth";
import { getClientAiProfile, updateClientAiProfile } from "../../lib/clients";
import { useEscapeToClose } from "../../lib/useEscapeToClose";

interface ClientAiProfileModalProps {
  clientId: number;
  clientName: string;
  onClose: () => void;
}

const ADDRESS_FORM_OPTIONS = ["Tegező", "Magázó"];

const TONE_OPTIONS = [
  "Professzionális/Szakmai",
  "Barátságos",
  "Humoros",
  "Inspiráló",
  "Prémium/Elegáns",
  "Energikus/Fiatalos",
  "Nyugodt/Megbízható",
  "Egyéb",
];

// A tartalom-gyártás kreatív/tartalmi stílus-döntései — ezt a csapat
// építi fel utólag, az onboarding-hívás alapján (lásd
// ClientOnboardingModal.tsx a vállalkozásról szóló tényekért és a
// szolgáltatás-terjedelemért, azok külön kategóriában élnek). Minden
// mező kötelező (a "-" jelöli, hogy egy adott dolog explicit nincs), a
// vizuális irány (brand színek) kivétel: az üresen hagyható.
export default function ClientAiProfileModal({ clientId, clientName, onClose }: ClientAiProfileModalProps) {
  useEscapeToClose(onClose);
  const { auth } = useAuth();
  const token = auth?.token ?? null;

  const [loading, setLoading] = useState(true);
  const [addressForm, setAddressForm] = useState("");
  const [toneStyle, setToneStyle] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [colors, setColors] = useState<{ role: string; hex: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportText, setExportText] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    getClientAiProfile(token, clientId)
      .then((profile) => {
        if (!profile) return;
        const brandVoiceParts = profile.brand_voice ? profile.brand_voice.split(",").map((v) => v.trim()) : [];
        setAddressForm(brandVoiceParts.find((v) => ADDRESS_FORM_OPTIONS.includes(v)) ?? "");
        setToneStyle(brandVoiceParts.find((v) => TONE_OPTIONS.includes(v)) ?? "");
        setTargetAudience(profile.target_audience ?? "");
        setColors(
          profile.visual_direction
            ? profile.visual_direction
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean)
                .map((line) => {
                  const idx = line.indexOf(":");
                  return idx === -1
                    ? { role: "", hex: line.trim() }
                    : { role: line.slice(0, idx).trim(), hex: line.slice(idx + 1).trim() };
                })
            : []
        );
      })
      .finally(() => setLoading(false));
  }, [token, clientId]);

  function addColor() {
    setColors((prev) => [...prev, { role: "", hex: "" }]);
  }

  function updateColorRole(index: number, role: string) {
    setColors((prev) => prev.map((c, i) => (i === index ? { ...c, role } : c)));
  }

  function updateColorHex(index: number, hex: string) {
    setColors((prev) => prev.map((c, i) => (i === index ? { ...c, hex } : c)));
  }

  function removeColor(index: number) {
    setColors((prev) => prev.filter((_, i) => i !== index));
  }

  function validate(): string | null {
    if (!addressForm) return "Válaszd ki a megszólítás formáját.";
    if (!toneStyle) return "Válassz hangvételt.";
    if (!targetAudience.trim()) return "A célközönség mező kitöltése kötelező (írj '-'-t, ha nem releváns).";
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateClientAiProfile(token, clientId, {
        brandVoice: `${addressForm}, ${toneStyle}`,
        targetAudience: targetAudience.trim(),
        visualDirection:
          colors
            .filter((c) => c.hex.trim())
            .map((c) => `${c.role.trim() || "Szín"}: ${c.hex.trim()}`)
            .join("\n") || undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült menteni az AI-profilt");
      setSaving(false);
    }
  }

  function buildExportText(): string {
    const lines = [`ÜGYFÉL: ${clientName}`, ""];
    if (addressForm || toneStyle) lines.push(`Hangvétel: ${[addressForm, toneStyle].filter(Boolean).join(", ")}`, "");
    if (targetAudience.trim()) lines.push(`Célközönség: ${targetAudience.trim()}`, "");
    const filledColors = colors.filter((c) => c.hex.trim());
    if (filledColors.length) {
      lines.push("Brand színek:", ...filledColors.map((c) => `  ${c.role.trim() || "Szín"}: ${c.hex.trim()}`), "");
    }
    return lines.join("\n").trim();
  }

  function handleExport() {
    const text = buildExportText();
    setExportText(text);
    navigator.clipboard?.writeText(text).catch(() => {});
  }

  return (
    <div className="chat-modal-backdrop">
      <form className="chat-modal lead-form" onSubmit={handleSubmit}>
        <h2>AI-profil — {clientName}</h2>

        {loading ? (
          <p className="chat-empty-hint">Betöltés...</p>
        ) : (
          <>
            <h3>Megszólítás</h3>

            <label htmlFor="ai-address-form">Megszólítás formája</label>
            <select id="ai-address-form" value={addressForm} onChange={(e) => setAddressForm(e.currentTarget.value)}>
              <option value="">Válassz...</option>
              {ADDRESS_FORM_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>

            <label htmlFor="ai-tone-style">Hangvétel</label>
            <select id="ai-tone-style" value={toneStyle} onChange={(e) => setToneStyle(e.currentTarget.value)}>
              <option value="">Válassz...</option>
              {TONE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>

            <label htmlFor="ai-target-audience">Célközönség (kikhez akarunk szólni)</label>
            <input
              id="ai-target-audience"
              value={targetAudience}
              onChange={(e) => setTargetAudience(e.currentTarget.value)}
              placeholder="Pl. kisvállalkozók, akik most kezdenek social media-zni — vagy '-'"
            />

            <label>Vizuális irány — brand színek</label>
            <p className="chat-empty-hint">
              Add meg, melyik szín mire való (pl. Fő háttér, Elsődleges brand szín, Gomb/link szín, Border) és a HEX
              kódját.
            </p>
            {colors.map((color, i) => (
              <div key={i} className="ai-profile-color-row">
                {color.hex.trim() && <span className="ai-profile-color-swatch" style={{ background: color.hex.trim() }} />}
                <input
                  value={color.role}
                  onChange={(e) => updateColorRole(i, e.currentTarget.value)}
                  placeholder="Pl. Fő háttér"
                  className="ai-profile-color-role"
                />
                <input
                  value={color.hex}
                  onChange={(e) => updateColorHex(i, e.currentTarget.value)}
                  placeholder="#020D19"
                  className="ai-profile-color-hex"
                />
                <button type="button" onClick={() => removeColor(i)}>
                  ×
                </button>
              </div>
            ))}
            <div className="sm-detail-action">
              <button type="button" onClick={addColor}>
                + Szín hozzáadása
              </button>
            </div>

            <div className="sm-detail-action">
              <button type="button" onClick={handleExport}>
                Profil exportálása (vágólapra + külső AI-hoz)
              </button>
            </div>
            {exportText && (
              <>
                <p className="chat-empty-hint">
                  Vágólapra másolva (ha engedélyezve van a böngésző) — vagy jelöld ki innen kézzel, és illeszd be egy
                  külső AI-chatbe (pl. Claude, ChatGPT).
                </p>
                <textarea readOnly rows={8} value={exportText} onClick={(e) => e.currentTarget.select()} />
              </>
            )}
          </>
        )}

        {error && <p className="login-error">{error}</p>}

        <div className="chat-modal-actions">
          <button type="button" onClick={onClose} disabled={saving}>
            Mégse
          </button>
          <button type="submit" disabled={saving || loading}>
            {saving ? "Mentés..." : "Mentés"}
          </button>
        </div>
      </form>
    </div>
  );
}
