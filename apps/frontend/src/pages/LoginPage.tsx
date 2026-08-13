import { useState, type FormEvent } from "react";
import { useAuth } from "../lib/auth";
import { ApiError } from "../lib/api";
import { getApiUrl, setApiUrl } from "../lib/serverConfig";
import logo from "../assets/logo.png";

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [showServerSettings, setShowServerSettings] = useState(false);
  const [serverUrl, setServerUrl] = useState(getApiUrl());

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Nem sikerült kapcsolódni a szerverhez.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleSaveServerUrl() {
    setApiUrl(serverUrl);
    setServerUrl(getApiUrl());
    setShowServerSettings(false);
  }

  return (
    <main className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <img src={logo} alt="RunMate CRM" className="login-logo" />
        <h1>RunMate CRM</h1>
        <p className="login-subtitle">Jelentkezz be a folytatáshoz</p>

        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.currentTarget.value)}
          autoComplete="username"
          required
        />

        <label htmlFor="password">Jelszó</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.currentTarget.value)}
          autoComplete="current-password"
          required
        />

        {error && <p className="login-error">{error}</p>}

        <button type="submit" disabled={submitting}>
          {submitting ? "Bejelentkezés..." : "Bejelentkezés"}
        </button>

        <button
          type="button"
          className="login-server-toggle"
          onClick={() => setShowServerSettings((v) => !v)}
        >
          Szerver: {getApiUrl()}
        </button>

        {showServerSettings && (
          <div className="login-server-panel">
            <label htmlFor="server-url">Szerver cím</label>
            <input
              id="server-url"
              type="text"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.currentTarget.value)}
              placeholder="http://192.168.1.50:3001"
            />
            <button type="button" onClick={handleSaveServerUrl}>
              Mentés
            </button>
          </div>
        )}
      </form>
    </main>
  );
}
