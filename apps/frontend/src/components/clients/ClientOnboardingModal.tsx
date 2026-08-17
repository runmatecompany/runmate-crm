import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "../../lib/auth";
import { getClientOnboarding, updateClientOnboarding } from "../../lib/clientOnboarding";
import { useEscapeToClose } from "../../lib/useEscapeToClose";

interface ClientOnboardingModalProps {
  clientId: number;
  clientName: string;
  onClose: () => void;
}

// Az ügyfél-onboarding kérdőíve — ezt tölti ki a hívó kolléga élőben, amíg
// telefonon végigkérdezi az ügyfelet. A vállalkozásról szóló tényeket és
// azt tárolja, amit MI vállalunk nekik (platformok, mennyiségek,
// szolgáltatások) — a kreatív/tartalmi stílus-döntések (megszólítás,
// hangvétel, brand színek) külön, az AI-profilban élnek, azokat utólag a
// csapat építi fel a beszélgetés alapján. Saját, széles, szekciózott
// modal-elrendezést használ (nem a szűk .chat-modal-t) — 18+ mezőt nem
// lehet kényelmesen egy 360px-es dobozba szorítani.
export default function ClientOnboardingModal({ clientId, clientName, onClose }: ClientOnboardingModalProps) {
  useEscapeToClose(onClose);
  const { auth } = useAuth();
  const token = auth?.token ?? null;

  const [loading, setLoading] = useState(true);
  const [industry, setIndustry] = useState("");
  const [businessDescription, setBusinessDescription] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [brandAssetsLocation, setBrandAssetsLocation] = useState("");
  const [existingLinks, setExistingLinks] = useState<{ label: string; url: string }[]>([]);

  const [platformFacebook, setPlatformFacebook] = useState(false);
  const [platformInstagram, setPlatformInstagram] = useState(false);
  const [platformTiktok, setPlatformTiktok] = useState(false);
  const [platformYoutube, setPlatformYoutube] = useState(false);
  const [serviceWebsiteBuild, setServiceWebsiteBuild] = useState(false);
  const [serviceLandingPage, setServiceLandingPage] = useState(false);
  const [serviceClipping, setServiceClipping] = useState(false);
  const [clippingSourceFolderUrl, setClippingSourceFolderUrl] = useState("");
  const [monthlyVideoTarget, setMonthlyVideoTarget] = useState("");
  const [monthlyPostTarget, setMonthlyPostTarget] = useState("");

  const [collaborationGoals, setCollaborationGoals] = useState("");
  const [approvalProcessNotes, setApprovalProcessNotes] = useState("");
  const [approverName, setApproverName] = useState("");
  const [approverEmail, setApproverEmail] = useState("");
  const [otherNotes, setOtherNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    getClientOnboarding(token, clientId)
      .then((profile) => {
        if (!profile) return;
        setIndustry(profile.industry ?? "");
        setBusinessDescription(profile.business_description ?? "");
        setWebsiteUrl(profile.website_url ?? "");
        setBrandAssetsLocation(profile.brand_assets_location ?? "");
        setExistingLinks(
          [
            profile.facebook_url && { label: "Facebook", url: profile.facebook_url },
            profile.instagram_url && { label: "Instagram", url: profile.instagram_url },
            profile.tiktok_url && { label: "TikTok", url: profile.tiktok_url },
            profile.youtube_url && { label: "YouTube", url: profile.youtube_url },
          ].filter((v): v is { label: string; url: string } => Boolean(v))
        );
        setPlatformFacebook(profile.platform_facebook);
        setPlatformInstagram(profile.platform_instagram);
        setPlatformTiktok(profile.platform_tiktok);
        setPlatformYoutube(profile.platform_youtube);
        setServiceWebsiteBuild(profile.service_website_build);
        setServiceLandingPage(profile.service_landing_page);
        setServiceClipping(profile.service_clipping);
        setClippingSourceFolderUrl(profile.clipping_source_folder_url ?? "");
        setMonthlyVideoTarget(profile.monthly_video_target != null ? String(profile.monthly_video_target) : "");
        setMonthlyPostTarget(profile.monthly_post_target != null ? String(profile.monthly_post_target) : "");
        setCollaborationGoals(profile.collaboration_goals ?? "");
        setApprovalProcessNotes(profile.approval_process_notes ?? "");
        setApproverName(profile.approver_name ?? "");
        setApproverEmail(profile.approver_email ?? "");
        setOtherNotes(profile.other_notes ?? "");
      })
      .finally(() => setLoading(false));
  }, [token, clientId]);

  const anyServiceSelected =
    platformFacebook ||
    platformInstagram ||
    platformTiktok ||
    platformYoutube ||
    serviceWebsiteBuild ||
    serviceLandingPage ||
    serviceClipping;

  const progress = useMemo(() => {
    const checks = [
      industry.trim(),
      businessDescription.trim(),
      websiteUrl.trim(),
      brandAssetsLocation.trim(),
      anyServiceSelected ? "x" : "",
      monthlyVideoTarget.trim(),
      monthlyPostTarget.trim(),
      collaborationGoals.trim(),
      approvalProcessNotes.trim(),
      approverName.trim(),
      approverEmail.trim(),
      otherNotes.trim(),
    ];
    const filled = checks.filter(Boolean).length;
    return { filled, total: checks.length, pct: Math.round((filled / checks.length) * 100) };
  }, [
    industry,
    businessDescription,
    websiteUrl,
    brandAssetsLocation,
    anyServiceSelected,
    monthlyVideoTarget,
    monthlyPostTarget,
    collaborationGoals,
    approvalProcessNotes,
    approverName,
    approverEmail,
    otherNotes,
  ]);

  function validate(): string | null {
    if (!industry.trim()) return "Az iparág / tevékenységi kör kitöltése kötelező.";
    if (!businessDescription.trim()) return "Add meg röviden, mivel foglalkozik a vállalkozás.";
    if (!websiteUrl.trim()) return "A weboldal mező kitöltése kötelező (írj '-'-t, ha nincs).";
    if (!anyServiceSelected) return "Válassz legalább egy szolgáltatást.";
    if (serviceClipping && !clippingSourceFolderUrl.trim()) {
      return "Clippeléshez kötelező megadni a forrás mappát.";
    }
    if (!monthlyVideoTarget.trim()) return "A havi videó mennyiség kitöltése kötelező.";
    if (!monthlyPostTarget.trim()) return "A havi poszt mennyiség kitöltése kötelező.";
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
      await updateClientOnboarding(token, clientId, {
        industry: industry.trim(),
        businessDescription: businessDescription.trim(),
        websiteUrl: websiteUrl.trim(),
        brandAssetsLocation: brandAssetsLocation.trim() || undefined,
        platformFacebook,
        platformInstagram,
        platformTiktok,
        platformYoutube,
        serviceWebsiteBuild,
        serviceLandingPage,
        serviceClipping,
        clippingSourceFolderUrl: serviceClipping ? clippingSourceFolderUrl.trim() : undefined,
        monthlyVideoTarget: Number(monthlyVideoTarget),
        monthlyPostTarget: Number(monthlyPostTarget),
        collaborationGoals: collaborationGoals.trim() || undefined,
        approvalProcessNotes: approvalProcessNotes.trim() || undefined,
        approverName: approverName.trim() || undefined,
        approverEmail: approverEmail.trim() || undefined,
        otherNotes: otherNotes.trim() || undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült menteni az onboarding-profilt");
      setSaving(false);
    }
  }

  return (
    <div className="ob-modal-backdrop">
      <div className="ob-modal">
        <div className="ob-modal-header">
          <div>
            <h2>Onboarding — {clientName}</h2>
            <p className="ob-modal-subtitle">
              Töltsd ki élőben a hívás közben — bármikor menthető, nem kell egyszerre végigvinni.
            </p>
          </div>
          <button type="button" className="ob-close-btn" onClick={onClose} aria-label="Bezárás">
            ×
          </button>
        </div>

        {!loading && (
          <div className="ob-progress">
            <div className="ob-progress-track">
              <div className="ob-progress-fill" style={{ width: `${progress.pct}%` }} />
            </div>
            <span className="ob-progress-label">
              {progress.filled}/{progress.total} mező kitöltve
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="ob-body">
            {loading ? (
              <p className="chat-empty-hint">Betöltés...</p>
            ) : (
              <>
                <section className="ob-section">
                  <div className="ob-section-header">
                    <span className="ob-section-badge">1</span>
                    <div>
                      <div className="ob-section-title">Vállalkozás adatai</div>
                      <p className="ob-section-desc">Alapinformációk a cégről, amit mindenkinek tudnia kell, aki ezzel az ügyféllel dolgozik.</p>
                    </div>
                  </div>

                  <div className="ob-grid">
                    <div className="ob-field">
                      <label htmlFor="ob-industry">Iparág / tevékenységi kör</label>
                      <input
                        id="ob-industry"
                        value={industry}
                        onChange={(e) => setIndustry(e.currentTarget.value)}
                        placeholder="Pl. étterem, fitness stúdió, e-kereskedelem"
                      />
                    </div>
                    <div className="ob-field">
                      <label htmlFor="ob-website">Weboldal</label>
                      <input
                        id="ob-website"
                        value={websiteUrl}
                        onChange={(e) => setWebsiteUrl(e.currentTarget.value)}
                        placeholder="https://... vagy -"
                      />
                    </div>
                    <div className="ob-field ob-field-full">
                      <label htmlFor="ob-description">Mivel foglalkozik a vállalkozás (röviden)</label>
                      <textarea
                        id="ob-description"
                        rows={3}
                        value={businessDescription}
                        onChange={(e) => setBusinessDescription(e.currentTarget.value)}
                        placeholder="Termékek/szolgáltatások, amit kínálnak — hogy aki szöveget ír, tudja miről van szó"
                      />
                    </div>
                    <div className="ob-field ob-field-full">
                      <label htmlFor="ob-brand-assets">Meglévő márka-anyagok elérhetősége</label>
                      <input
                        id="ob-brand-assets"
                        value={brandAssetsLocation}
                        onChange={(e) => setBrandAssetsLocation(e.currentTarget.value)}
                        placeholder="Logó, fotók, arculati kézikönyv helye (Drive link, vagy hogy nincs)"
                      />
                    </div>
                  </div>

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
                </section>

                <section className="ob-section ob-section--services">
                  <div className="ob-section-header">
                    <span className="ob-section-badge">2</span>
                    <div>
                      <div className="ob-section-title">Amit vállalunk nekik</div>
                      <p className="ob-section-desc">A szolgáltatás terjedelme — mire vállaltunk munkát, nem az, hogy hol van már jelenleg jelenléte.</p>
                    </div>
                  </div>

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
                      <label htmlFor="ob-clipping-source">Forrás mappa (Drive link, ahonnan a vágó dolgozik)</label>
                      <input
                        id="ob-clipping-source"
                        value={clippingSourceFolderUrl}
                        onChange={(e) => setClippingSourceFolderUrl(e.currentTarget.value)}
                        placeholder="https://drive.google.com/..."
                      />
                      <p className="chat-empty-hint">
                        A havi videó-cél alapján minden hónapban, a hónapváltás előtt 10 nappal automatikusan
                        létrejön a megfelelő mennyiségű "Vágásra vár" tartalom ebből a mappából — de a munka csak
                        akkor indítható, ha admin jóváhagyta, hogy az ügyfél fizetett.
                      </p>
                    </div>
                  )}

                  <div className="ob-grid">
                    <div className="ob-field">
                      <label htmlFor="ob-monthly-video-target">Havi videó mennyiség</label>
                      <input
                        id="ob-monthly-video-target"
                        type="number"
                        min={0}
                        value={monthlyVideoTarget}
                        onChange={(e) => setMonthlyVideoTarget(e.currentTarget.value)}
                        placeholder="Pl. 8"
                      />
                    </div>
                    <div className="ob-field">
                      <label htmlFor="ob-monthly-post-target">Havi poszt mennyiség</label>
                      <input
                        id="ob-monthly-post-target"
                        type="number"
                        min={0}
                        value={monthlyPostTarget}
                        onChange={(e) => setMonthlyPostTarget(e.currentTarget.value)}
                        placeholder="Pl. 8"
                      />
                    </div>
                  </div>
                </section>

                <section className="ob-section ob-section--collab">
                  <div className="ob-section-header">
                    <span className="ob-section-badge">3</span>
                    <div>
                      <div className="ob-section-title">Együttműködés kerete</div>
                      <p className="ob-section-desc">Cél, jóváhagyási folyamat, és kihez forduljunk, ha kérdés merül fel a tartalmakkal kapcsolatban.</p>
                    </div>
                  </div>

                  <div className="ob-grid">
                    <div className="ob-field ob-field-full">
                      <label htmlFor="ob-goals">Az együttműködés célja (mit szeretne elérni az ügyfél)</label>
                      <textarea
                        id="ob-goals"
                        rows={2}
                        value={collaborationGoals}
                        onChange={(e) => setCollaborationGoals(e.currentTarget.value)}
                        placeholder="Pl. ismertség növelése, több foglalás/eladás, követőszám növelése..."
                      />
                    </div>
                    <div className="ob-field ob-field-full">
                      <label htmlFor="ob-approval">
                        Jóváhagyási folyamat (ki hagyja jóvá a tartalmakat, milyen határidővel)
                      </label>
                      <textarea
                        id="ob-approval"
                        rows={2}
                        value={approvalProcessNotes}
                        onChange={(e) => setApprovalProcessNotes(e.currentTarget.value)}
                        placeholder="Pl. a tulajdonos hagyja jóvá, 2 napon belül válaszol"
                      />
                    </div>
                    <div className="ob-field">
                      <label htmlFor="ob-approver-name">Tartalom-jóváhagyó kapcsolattartó neve</label>
                      <input
                        id="ob-approver-name"
                        value={approverName}
                        onChange={(e) => setApproverName(e.currentTarget.value)}
                        placeholder="Ha eltér a fő kapcsolattartótól"
                      />
                    </div>
                    <div className="ob-field">
                      <label htmlFor="ob-approver-email">Tartalom-jóváhagyó kapcsolattartó email címe</label>
                      <input
                        id="ob-approver-email"
                        type="email"
                        value={approverEmail}
                        onChange={(e) => setApproverEmail(e.currentTarget.value)}
                        placeholder="pl. marketing@ugyfelceg.hu"
                      />
                    </div>
                    <div className="ob-field ob-field-full">
                      <label htmlFor="ob-other-notes">Egyéb fontos infó</label>
                      <textarea
                        id="ob-other-notes"
                        rows={3}
                        value={otherNotes}
                        onChange={(e) => setOtherNotes(e.currentTarget.value)}
                        placeholder="Bármi más, amit a csapatnak tudnia kell erről az ügyfélről"
                      />
                    </div>
                  </div>
                </section>
              </>
            )}
          </div>

          <div className="ob-footer">
            {error ? <p className="ob-footer-error">{error}</p> : <span />}
            <div className="ob-footer-actions">
              <button type="button" onClick={onClose} disabled={saving}>
                Mégse
              </button>
              <button type="submit" className="ob-submit-btn" disabled={saving || loading}>
                {saving ? "Mentés..." : "Mentés"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
