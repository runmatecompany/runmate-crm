import { useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { checkServerReachable } from "../lib/setup";
import { getApiUrl } from "../lib/serverConfig";
import logo from "../assets/logo.png";

const TOTAL_STEPS = 4;

interface SetupWizardProps {
  onDone: () => void;
  onSkip: () => void;
}

export default function SetupWizard({ onDone, onSkip }: SetupWizardProps) {
  const [step, setStep] = useState(1);
  const [checking, setChecking] = useState(false);
  const [checkFailed, setCheckFailed] = useState(false);

  async function handleCheck() {
    setChecking(true);
    setCheckFailed(false);
    const ok = await checkServerReachable(getApiUrl());
    setChecking(false);
    if (ok) {
      onDone();
    } else {
      setCheckFailed(true);
    }
  }

  return (
    <main className="login-screen">
      <div className="login-card setup-card">
        <img src={logo} alt="RunMate CRM" className="login-logo" />

        <div className="setup-progress">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <span key={i} className={i + 1 <= step ? "setup-dot active" : "setup-dot"} />
          ))}
        </div>

        {step === 1 && (
          <div className="setup-step">
            <h1>Üdv a RunMate CRM-ben!</h1>
            <p className="login-subtitle">
              Pár lépésben beüzemeljük a gépedet — ehhez a céges hálózathoz kell csatlakoznod
              (Tailscale), hogy elérd a központi szervert. Utána már csak be kell jelentkezned.
            </p>
            <button type="button" onClick={() => setStep(2)}>
              Kezdjük
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="setup-step">
            <h1>1. Tailscale telepítése</h1>
            <p className="login-subtitle">
              A Tailscale egy biztonságos, privát hálózatot hoz létre a céges gépek között.
              Töltsd le és telepítsd, ha még nincs meg.
            </p>
            <button type="button" onClick={() => openUrl("https://tailscale.com/download")}>
              Tailscale letöltése
            </button>
            <div className="setup-nav">
              <button type="button" className="setup-back" onClick={() => setStep(1)}>
                Vissza
              </button>
              <button type="button" onClick={() => setStep(3)}>
                Már telepítettem
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="setup-step">
            <h1>2. Csatlakozás a céges hálózathoz</h1>
            <p className="login-subtitle">
              Nyisd meg az adminisztrátortól kapott Tailscale meghívó linket (email vagy üzenet),
              és fogadd el a megosztást. Ha nem kaptál linket, kérd el tőle.
            </p>
            <div className="setup-nav">
              <button type="button" className="setup-back" onClick={() => setStep(2)}>
                Vissza
              </button>
              <button type="button" onClick={() => setStep(4)}>
                Ezt is megtettem
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="setup-step">
            <h1>3. Ellenőrzés</h1>
            <p className="login-subtitle">Nézzük meg, sikerült-e elérni a céges szervert.</p>
            <button type="button" onClick={handleCheck} disabled={checking}>
              {checking ? "Ellenőrzés..." : "Kapcsolat ellenőrzése"}
            </button>
            {checkFailed && (
              <p className="login-error">
                Még nem sikerült elérni a szervert. Nézd át az előző lépéseket, majd próbáld
                újra.
              </p>
            )}
            <div className="setup-nav">
              <button type="button" className="setup-back" onClick={() => setStep(3)}>
                Vissza
              </button>
            </div>
          </div>
        )}

        <button type="button" className="login-server-toggle" onClick={onSkip}>
          Kihagyom, majd magam beállítom
        </button>
      </div>
    </main>
  );
}
