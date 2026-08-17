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

// Az ügyfél-onboarding kérdőíve — ezt tölti be minden AI-vázlat-generálás a
// Social Media modulban. Minden mező kötelező (a "-" jelöli, hogy egy adott
// dolog explicit nincs), a vizuális irány (brand színek) kivétel: az
// üresen hagyható.
export default function ClientAiProfileModal({ clientId, clientName, onClose }: ClientAiProfileModalProps) {
  useEscapeToClose(onClose);
  const { auth } = useAuth();
  const token = auth?.token ?? null;

  const [loading, setLoading] = useState(true);
  const [addressForm, setAddressForm] = useState("");
  const [toneStyle, setToneStyle] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [monthlyVideoTarget, setMonthlyVideoTarget] = useState("");
  const [monthlyPostTarget, setMonthlyPostTarget] = useState("");
  const [colors, setColors] = useState<string[]>([]);
  const [platformFacebook, setPlatformFacebook] = useState(false);
  const [platformInstagram, setPlatformInstagram] = useState(false);
  const [platformTiktok, setPlatformTiktok] = useState(false);
  const [platformYoutube, setPlatformYoutube] = useState(false);
  const [serviceWebsiteBuild, setServiceWebsiteBuild] = useState(false);
  const [serviceLandingPage, setServiceLandingPage] = useState(false);
  const [serviceClipping, setServiceClipping] = useState(false);
  const [clippingSourceFolderUrl, setClippingSourceFolderUrl] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [existingLinks, setExistingLinks] = useState<{ label: string; url: string }[]>([]);
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
        setMonthlyVideoTarget(profile.monthly_video_target != null ? String(profile.monthly_video_target) : "");
        setMonthlyPostTarget(profile.monthly_post_target != null ? String(profile.monthly_post_target) : "");
        setColors(profile.visual_direction ? profile.visual_direction.split(",").map((v) => v.trim()).filter(Boolean) : []);
        setPlatformFacebook(profile.platform_facebook);
        setPlatformInstagram(profile.platform_instagram);
        setPlatformTiktok(profile.platform_tiktok);
        setPlatformYoutube(profile.platform_youtube);
        setServiceWebsiteBuild(profile.service_website_build);
        setServiceLandingPage(profile.service_landing_page);
        setServiceClipping(profile.service_clipping);
        setClippingSourceFolderUrl(profile.clipping_source_folder_url ?? "");
        setWebsiteUrl(profile.website_url ?? "");
        setExistingLinks(
          [
            profile.facebook_url && { label: "Facebook", url: profile.facebook_url },
            profile.instagram_url && { label: "Instagram", url: profile.instagram_url },
            profile.tiktok_url && { label: "TikTok", url: profile.tiktok_url },
            profile.youtube_url && { label: "YouTube", url: profile.youtube_url },
          ].filter((v): v is { label: string; url: string } => Boolean(v))
        );
      })
      .finally(() => setLoading(false));
  }, [token, clientId]);

  function addColor() {
    setColors((prev) => [...prev, ""]);
  }

  function updateColor(index: number, value: string) {
    setColors((prev) => prev.map((c, i) => (i === index ? value : c)));
  }

  function removeColor(index: number) {
    setColors((prev) => prev.filter((_, i) => i !== index));
  }

  function validate(): string | null {
    if (!addressForm) return "Válaszd ki a megszólítás formáját.";
    if (!toneStyle) return "Válassz hangvételt.";
    if (!targetAudience.trim()) return "A célközönség mező kitöltése kötelező (írj '-'-t, ha nem releváns).";
    if (!monthlyVideoTarget.trim()) return "A havi videó mennyiség kitöltése kötelező.";
    if (!monthlyPostTarget.trim()) return "A havi poszt mennyiség kitöltése kötelező.";
    if (
      !platformFacebook &&
      !platformInstagram &&
      !platformTiktok &&
      !platformYoutube &&
      !serviceWebsiteBuild &&
      !serviceLandingPage &&
      !serviceClipping
    ) {
      return "Válassz legalább egy szolgáltatást.";
    }
    if (serviceClipping && !clippingSourceFolderUrl.trim()) {
      return "Clippeléshez kötelező megadni a forrás mappát.";
    }
    if (!websiteUrl.trim()) return "A weboldal mező kitöltése kötelező (írj '-'-t, ha nincs).";
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
        visualDirection: colors.filter((c) => c.trim()).join(", ") || undefined,
        monthlyVideoTarget: Number(monthlyVideoTarget),
        monthlyPostTarget: Number(monthlyPostTarget),
        platformFacebook,
        platformInstagram,
        platformTiktok,
        platformYoutube,
        serviceWebsiteBuild,
        serviceLandingPage,
        serviceClipping,
        clippingSourceFolderUrl: serviceClipping ? clippingSourceFolderUrl.trim() : undefined,
        websiteUrl: websiteUrl.trim(),
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
    if (monthlyVideoTarget.trim()) lines.push(`Havi videó mennyiség: ${monthlyVideoTarget.trim()}`, "");
    if (monthlyPostTarget.trim()) lines.push(`Havi poszt mennyiség: ${monthlyPostTarget.trim()}`, "");
    const filledColors = colors.filter((c) => c.trim());
    if (filledColors.length) lines.push(`Brand színek: ${filledColors.join(", ")}`, "");
    const services = [
      serviceWebsiteBuild && "Weboldal készítés",
      serviceLandingPage && "Landing oldal készítés",
      serviceClipping && "Clippelés",
      platformFacebook && "Facebook",
      platformInstagram && "Instagram",
      platformTiktok && "TikTok",
      platformYoutube && "YouTube",
    ].filter(Boolean);
    if (services.length) lines.push(`Szolgáltatások: ${services.join(", ")}`, "");
    if (serviceClipping && clippingSourceFolderUrl.trim()) {
      lines.push(`Clippelés forrás mappa: ${clippingSourceFolderUrl.trim()}`, "");
    }
    if (websiteUrl.trim()) lines.push(`Weboldal: ${websiteUrl.trim()}`, "");
    if (existingLinks.length) {
      lines.push(`Meglévő közösségi jelenlét: ${existingLinks.map((l) => `${l.label}: ${l.url}`).join(" · ")}`, "");
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

            <h3>Social media</h3>

            <label>Milyen szolgáltatásokat végzünk ennek az ügyfélnek?</label>
            <p className="chat-empty-hint">
              Ez a szolgáltatás terjedelme (mire vállalunk munkát), nem az, hogy az ügyfélnek hol van jelenleg
              jelenléte — azt a lead-kutatásnál rögzítettük, alább látszik referenciaként.
            </p>
            <div className="ai-profile-platform-row">
              <button
                type="button"
                className={serviceWebsiteBuild ? "ai-profile-platform-toggle active" : "ai-profile-platform-toggle"}
                onClick={() => setServiceWebsiteBuild((v) => !v)}
              >
                Weboldal készítés
              </button>
              <button
                type="button"
                className={serviceLandingPage ? "ai-profile-platform-toggle active" : "ai-profile-platform-toggle"}
                onClick={() => setServiceLandingPage((v) => !v)}
              >
                Landing oldal készítés
              </button>
              <button
                type="button"
                className={platformFacebook ? "ai-profile-platform-toggle active" : "ai-profile-platform-toggle"}
                onClick={() => setPlatformFacebook((v) => !v)}
              >
                Facebook
              </button>
              <button
                type="button"
                className={platformInstagram ? "ai-profile-platform-toggle active" : "ai-profile-platform-toggle"}
                onClick={() => setPlatformInstagram((v) => !v)}
              >
                Instagram
              </button>
              <button
                type="button"
                className={platformTiktok ? "ai-profile-platform-toggle active" : "ai-profile-platform-toggle"}
                onClick={() => setPlatformTiktok((v) => !v)}
              >
                TikTok
              </button>
              <button
                type="button"
                className={platformYoutube ? "ai-profile-platform-toggle active" : "ai-profile-platform-toggle"}
                onClick={() => setPlatformYoutube((v) => !v)}
              >
                YouTube
              </button>
              <button
                type="button"
                className={serviceClipping ? "ai-profile-platform-toggle active" : "ai-profile-platform-toggle"}
                onClick={() => setServiceClipping((v) => !v)}
              >
                Clippelés
              </button>
            </div>

            {serviceClipping && (
              <div className="sm-detail-field">
                <label htmlFor="ai-clipping-source">Forrás mappa (Drive link, ahonnan a vágó dolgozik)</label>
                <input
                  id="ai-clipping-source"
                  value={clippingSourceFolderUrl}
                  onChange={(e) => setClippingSourceFolderUrl(e.currentTarget.value)}
                  placeholder="https://drive.google.com/..."
                />
                <p className="chat-empty-hint">
                  A havi videó-cél alapján minden hónapban, a hónapváltás előtt 10 nappal automatikusan létrejön a
                  megfelelő mennyiségű "Vágásra vár" tartalom ebből a mappából — de a munka csak akkor indítható,
                  ha admin jóváhagyta, hogy az ügyfél fizetett.
                </p>
              </div>
            )}

            {existingLinks.length > 0 && (
              <div className="ai-profile-existing-links">
                <span className="chat-empty-hint">Meglévő közösségi jelenlét (a lead-kutatásból):</span>
                <ul>
                  {existingLinks.map((l) => (
                    <li key={l.label}>
                      <strong>{l.label}:</strong>{" "}
                      {l.url === "-" ? (
                        "nincs"
                      ) : (
                        <a href={l.url} target="_blank" rel="noreferrer">
                          {l.url}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <label htmlFor="ai-monthly-video-target">Havi videó mennyiség</label>
            <input
              id="ai-monthly-video-target"
              type="number"
              min={0}
              value={monthlyVideoTarget}
              onChange={(e) => setMonthlyVideoTarget(e.currentTarget.value)}
              placeholder="Pl. 8"
            />

            <label htmlFor="ai-monthly-post-target">Havi poszt mennyiség</label>
            <input
              id="ai-monthly-post-target"
              type="number"
              min={0}
              value={monthlyPostTarget}
              onChange={(e) => setMonthlyPostTarget(e.currentTarget.value)}
              placeholder="Pl. 8"
            />

            <label>Vizuális irány — brand színek</label>
            {colors.map((color, i) => (
              <div key={i} className="ai-profile-color-row">
                {color.trim() && <span className="ai-profile-color-swatch" style={{ background: color.trim() }} />}
                <input
                  value={color}
                  onChange={(e) => updateColor(i, e.currentTarget.value)}
                  placeholder="#FF5733"
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

            <h3>Weboldal</h3>
            <label htmlFor="ai-website-url">Weboldal</label>
            <input
              id="ai-website-url"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.currentTarget.value)}
              placeholder="https://... vagy -"
            />

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
