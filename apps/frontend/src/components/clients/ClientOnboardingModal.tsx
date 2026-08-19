import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "../../lib/auth";
import { getClientOnboarding, splitPlatforms, updateClientOnboarding } from "../../lib/clientOnboarding";
import { useEscapeToClose } from "../../lib/useEscapeToClose";

interface ClientOnboardingModalProps {
  clientId: number;
  clientName: string;
  onClose: () => void;
}

const PLATFORM_OPTIONS = ["Facebook", "Instagram", "TikTok", "YouTube"] as const;

function togglePlatform(list: string[], name: string): string[] {
  return list.includes(name) ? list.filter((p) => p !== name) : [...list, name];
}

// Az ügyfél-onboarding kérdőíve — ezt tölti ki a hívó kolléga élőben, amíg
// telefonon végigkérdezi az ügyfelet. A vállalkozásról szóló tényeket és
// azt tárolja, amit MI vállalunk nekik — az 5 szolgáltatás (Weboldal,
// Landing, Short videók, Képes posztok, Clippelés) mindegyike önálló
// kapcsoló, ami CSAK a hozzá tartozó kérdéscsoportot nyitja meg, saját
// platform-választással (egy ügyfélnek lehet pl. csak TikTokra videója, de
// Facebookra posztja). A kreatív/tartalmi stílus-döntések (megszólítás,
// hangvétel, brand színek) külön, az AI-profilban élnek, azokat utólag a
// csapat építi fel a beszélgetés alapján. Saját, széles, szekciózott
// modal-elrendezést használ (nem a szűk .chat-modal-t) — sok mezőt nem
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

  const [serviceWebsiteBuild, setServiceWebsiteBuild] = useState(false);
  const [websitePagesCount, setWebsitePagesCount] = useState("");
  const [websiteDomainHosting, setWebsiteDomainHosting] = useState("");
  const [websiteReferenceNotes, setWebsiteReferenceNotes] = useState("");

  const [serviceLandingPage, setServiceLandingPage] = useState(false);
  const [landingGoal, setLandingGoal] = useState("");
  const [landingDomainHosting, setLandingDomainHosting] = useState("");
  const [landingReferenceNotes, setLandingReferenceNotes] = useState("");

  const [serviceShortVideos, setServiceShortVideos] = useState(false);
  const [shortVideosPlatforms, setShortVideosPlatforms] = useState<string[]>([]);
  const [monthlyVideoTarget, setMonthlyVideoTarget] = useState("");

  const [serviceImagePosts, setServiceImagePosts] = useState(false);
  const [imagePostsPlatforms, setImagePostsPlatforms] = useState<string[]>([]);
  const [monthlyPostTarget, setMonthlyPostTarget] = useState("");

  const [serviceClipping, setServiceClipping] = useState(false);
  const [clippingPlatforms, setClippingPlatforms] = useState<string[]>([]);
  const [clippingSourceFolderUrl, setClippingSourceFolderUrl] = useState("");
  const [clippingDailyTarget, setClippingDailyTarget] = useState("");

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
        setServiceWebsiteBuild(profile.service_website_build);
        setWebsitePagesCount(profile.website_pages_count != null ? String(profile.website_pages_count) : "");
        setWebsiteDomainHosting(profile.website_domain_hosting ?? "");
        setWebsiteReferenceNotes(profile.website_reference_notes ?? "");
        setServiceLandingPage(profile.service_landing_page);
        setLandingGoal(profile.landing_goal ?? "");
        setLandingDomainHosting(profile.landing_domain_hosting ?? "");
        setLandingReferenceNotes(profile.landing_reference_notes ?? "");
        setServiceShortVideos(profile.service_short_videos);
        setShortVideosPlatforms(splitPlatforms(profile.short_videos_platforms));
        setMonthlyVideoTarget(profile.monthly_video_target != null ? String(profile.monthly_video_target) : "");
        setServiceImagePosts(profile.service_image_posts);
        setImagePostsPlatforms(splitPlatforms(profile.image_posts_platforms));
        setMonthlyPostTarget(profile.monthly_post_target != null ? String(profile.monthly_post_target) : "");
        setServiceClipping(profile.service_clipping);
        setClippingPlatforms(splitPlatforms(profile.clipping_platforms));
        setClippingSourceFolderUrl(profile.clipping_source_folder_url ?? "");
        setClippingDailyTarget(profile.clipping_daily_target != null ? String(profile.clipping_daily_target) : "");
        setCollaborationGoals(profile.collaboration_goals ?? "");
        setApprovalProcessNotes(profile.approval_process_notes ?? "");
        setApproverName(profile.approver_name ?? "");
        setApproverEmail(profile.approver_email ?? "");
        setOtherNotes(profile.other_notes ?? "");
      })
      .finally(() => setLoading(false));
  }, [token, clientId]);

  const anyServiceSelected =
    serviceWebsiteBuild || serviceLandingPage || serviceShortVideos || serviceImagePosts || serviceClipping;

  const progress = useMemo(() => {
    const checks = [
      industry.trim(),
      businessDescription.trim(),
      websiteUrl.trim(),
      brandAssetsLocation.trim(),
      anyServiceSelected ? "x" : "",
    ];
    if (serviceWebsiteBuild) checks.push(websitePagesCount.trim());
    if (serviceLandingPage) checks.push(landingGoal.trim());
    if (serviceShortVideos) checks.push(monthlyVideoTarget.trim(), shortVideosPlatforms.length > 0 ? "x" : "");
    if (serviceImagePosts) checks.push(monthlyPostTarget.trim(), imagePostsPlatforms.length > 0 ? "x" : "");
    if (serviceClipping) {
      checks.push(clippingSourceFolderUrl.trim(), clippingDailyTarget.trim(), clippingPlatforms.length > 0 ? "x" : "");
    }
    checks.push(
      collaborationGoals.trim(),
      approvalProcessNotes.trim(),
      approverName.trim(),
      approverEmail.trim(),
      otherNotes.trim()
    );
    const filled = checks.filter(Boolean).length;
    return { filled, total: checks.length, pct: Math.round((filled / checks.length) * 100) };
  }, [
    industry,
    businessDescription,
    websiteUrl,
    brandAssetsLocation,
    anyServiceSelected,
    serviceWebsiteBuild,
    websitePagesCount,
    serviceLandingPage,
    landingGoal,
    serviceShortVideos,
    monthlyVideoTarget,
    shortVideosPlatforms,
    serviceImagePosts,
    monthlyPostTarget,
    imagePostsPlatforms,
    serviceClipping,
    clippingSourceFolderUrl,
    clippingDailyTarget,
    clippingPlatforms,
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
    if (serviceWebsiteBuild && !websitePagesCount.trim()) return "A weboldal aloldalainak száma kitöltése kötelező.";
    if (serviceLandingPage && !landingGoal.trim()) return "A landing oldal célja kitöltése kötelező.";
    if (serviceShortVideos) {
      if (!monthlyVideoTarget.trim()) return "A havi videó mennyiség kitöltése kötelező.";
      if (shortVideosPlatforms.length === 0) return "Válassz legalább egy platformot a Short videókhoz.";
    }
    if (serviceImagePosts) {
      if (!monthlyPostTarget.trim()) return "A havi poszt mennyiség kitöltése kötelező.";
      if (imagePostsPlatforms.length === 0) return "Válassz legalább egy platformot a Képes posztokhoz.";
    }
    if (serviceClipping) {
      if (!clippingSourceFolderUrl.trim()) return "Clippeléshez kötelező megadni a forrás mappát.";
      if (!clippingDailyTarget.trim()) return "A napi klip mennyiség kitöltése kötelező.";
      if (clippingPlatforms.length === 0) return "Válassz legalább egy platformot a Clippeléshez.";
    }
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
        serviceWebsiteBuild,
        websitePagesCount: serviceWebsiteBuild ? Number(websitePagesCount) : undefined,
        websiteDomainHosting: serviceWebsiteBuild ? websiteDomainHosting.trim() || undefined : undefined,
        websiteReferenceNotes: serviceWebsiteBuild ? websiteReferenceNotes.trim() || undefined : undefined,
        serviceLandingPage,
        landingGoal: serviceLandingPage ? landingGoal.trim() || undefined : undefined,
        landingDomainHosting: serviceLandingPage ? landingDomainHosting.trim() || undefined : undefined,
        landingReferenceNotes: serviceLandingPage ? landingReferenceNotes.trim() || undefined : undefined,
        serviceShortVideos,
        shortVideosPlatforms: serviceShortVideos ? shortVideosPlatforms : undefined,
        monthlyVideoTarget: serviceShortVideos ? Number(monthlyVideoTarget) : undefined,
        serviceImagePosts,
        imagePostsPlatforms: serviceImagePosts ? imagePostsPlatforms : undefined,
        monthlyPostTarget: serviceImagePosts ? Number(monthlyPostTarget) : undefined,
        serviceClipping,
        clippingPlatforms: serviceClipping ? clippingPlatforms : undefined,
        clippingSourceFolderUrl: serviceClipping ? clippingSourceFolderUrl.trim() : undefined,
        clippingDailyTarget: serviceClipping ? Number(clippingDailyTarget) : undefined,
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

  function renderPlatformPicker(selected: string[], onChange: (next: string[]) => void) {
    return (
      <div className="ob-platform-row">
        {PLATFORM_OPTIONS.map((name) => (
          <button
            key={name}
            type="button"
            className={selected.includes(name) ? "ai-profile-platform-toggle active" : "ai-profile-platform-toggle"}
            onClick={() => onChange(togglePlatform(selected, name))}
          >
            {name}
          </button>
        ))}
      </div>
    );
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

        <form className="ob-form" onSubmit={handleSubmit}>
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
                      <p className="ob-section-desc">
                        Válaszd ki, milyen szolgáltatásokat vállaltunk — mindegyik a saját, hozzá tartozó kérdéseit
                        nyitja meg.
                      </p>
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
                      className={serviceShortVideos ? "ai-profile-platform-toggle active" : "ai-profile-platform-toggle"}
                      onClick={() => setServiceShortVideos((v) => !v)}
                    >
                      Short videók
                    </button>
                    <button
                      type="button"
                      className={serviceImagePosts ? "ai-profile-platform-toggle active" : "ai-profile-platform-toggle"}
                      onClick={() => setServiceImagePosts((v) => !v)}
                    >
                      Képes posztok
                    </button>
                    <button
                      type="button"
                      className={serviceClipping ? "ai-profile-platform-toggle active" : "ai-profile-platform-toggle"}
                      onClick={() => setServiceClipping((v) => !v)}
                    >
                      Clippelés
                    </button>
                  </div>

                  {serviceWebsiteBuild && (
                    <div className="sm-detail-field">
                      <div className="ob-service-block-title">Weboldal készítés</div>
                      <label htmlFor="ob-website-pages">Hány aloldal</label>
                      <input
                        id="ob-website-pages"
                        type="number"
                        min={0}
                        value={websitePagesCount}
                        onChange={(e) => setWebsitePagesCount(e.currentTarget.value)}
                        placeholder="Pl. 5"
                      />
                      <label htmlFor="ob-website-hosting">Van-e már domain/tárhely</label>
                      <input
                        id="ob-website-hosting"
                        value={websiteDomainHosting}
                        onChange={(e) => setWebsiteDomainHosting(e.currentTarget.value)}
                        placeholder="Pl. van, ez: ..., vagy: nincs, azt is intézzük"
                      />
                      <label htmlFor="ob-website-reference">Referencia oldalak / stílus-elvárások</label>
                      <input
                        id="ob-website-reference"
                        value={websiteReferenceNotes}
                        onChange={(e) => setWebsiteReferenceNotes(e.currentTarget.value)}
                        placeholder="Amit szeret, aminek stílusát követni kéne"
                      />
                    </div>
                  )}

                  {serviceLandingPage && (
                    <div className="sm-detail-field">
                      <div className="ob-service-block-title">Landing oldal készítés</div>
                      <label htmlFor="ob-landing-goal">A landing oldal célja</label>
                      <input
                        id="ob-landing-goal"
                        value={landingGoal}
                        onChange={(e) => setLandingGoal(e.currentTarget.value)}
                        placeholder="Pl. lead-gyűjtés, termékbemutató, esemény"
                      />
                      <label htmlFor="ob-landing-hosting">Van-e már domain/tárhely</label>
                      <input
                        id="ob-landing-hosting"
                        value={landingDomainHosting}
                        onChange={(e) => setLandingDomainHosting(e.currentTarget.value)}
                        placeholder="Pl. van, ez: ..., vagy: nincs, azt is intézzük"
                      />
                      <label htmlFor="ob-landing-reference">Referencia oldalak / stílus-elvárások</label>
                      <input
                        id="ob-landing-reference"
                        value={landingReferenceNotes}
                        onChange={(e) => setLandingReferenceNotes(e.currentTarget.value)}
                        placeholder="Amit szeret, aminek stílusát követni kéne"
                      />
                    </div>
                  )}

                  {serviceShortVideos && (
                    <div className="sm-detail-field">
                      <div className="ob-service-block-title">Short videók</div>
                      <label htmlFor="ob-short-videos-target">Havi hány videó</label>
                      <input
                        id="ob-short-videos-target"
                        type="number"
                        min={0}
                        value={monthlyVideoTarget}
                        onChange={(e) => setMonthlyVideoTarget(e.currentTarget.value)}
                        placeholder="Pl. 8"
                      />
                      <span className="chat-empty-hint">Milyen platformokra</span>
                      {renderPlatformPicker(shortVideosPlatforms, setShortVideosPlatforms)}
                    </div>
                  )}

                  {serviceImagePosts && (
                    <div className="sm-detail-field">
                      <div className="ob-service-block-title">Képes posztok</div>
                      <label htmlFor="ob-image-posts-target">Havi hány poszt</label>
                      <input
                        id="ob-image-posts-target"
                        type="number"
                        min={0}
                        value={monthlyPostTarget}
                        onChange={(e) => setMonthlyPostTarget(e.currentTarget.value)}
                        placeholder="Pl. 8"
                      />
                      <span className="chat-empty-hint">Milyen platformokra</span>
                      {renderPlatformPicker(imagePostsPlatforms, setImagePostsPlatforms)}
                    </div>
                  )}

                  {serviceClipping && (
                    <div className="sm-detail-field">
                      <div className="ob-service-block-title">Clippelés</div>
                      <label htmlFor="ob-clipping-source">Forrás mappa (Drive link, ahonnan a vágó dolgozik)</label>
                      <input
                        id="ob-clipping-source"
                        value={clippingSourceFolderUrl}
                        onChange={(e) => setClippingSourceFolderUrl(e.currentTarget.value)}
                        placeholder="https://drive.google.com/..."
                      />

                      <label htmlFor="ob-clipping-daily-target">Napi klip mennyiség</label>
                      <input
                        id="ob-clipping-daily-target"
                        type="number"
                        min={0}
                        value={clippingDailyTarget}
                        onChange={(e) => setClippingDailyTarget(e.currentTarget.value)}
                        placeholder="Pl. 3"
                      />
                      <p className="chat-empty-hint">
                        A havi cél ebből számolódik ki automatikusan, a naptári hónap tényleges napjainak száma
                        alapján (pl. napi 3 → 28 naposhónapban 84, 31 naposban 93) — a kész klipek száma élőben a
                        "Videók/Megvágva" Drive-mappából olvasódik, a munka csak akkor válik láthatóvá/elérhetővé,
                        ha admin jóváhagyta, hogy az ügyfél fizetett.
                      </p>
                      <span className="chat-empty-hint">Milyen platformokra kerülnek fel a kész klipek</span>
                      {renderPlatformPicker(clippingPlatforms, setClippingPlatforms)}
                    </div>
                  )}
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
