import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

// Az egész appot körbeöleli — enélkül BÁRMELY, render közben elszálló
// kivétel (pl. egy váratlan formátumú fájl feldolgozásánál) az egész
// React-fát leszedi, üres/törött képernyőt hagyva maga után, amit a
// felhasználó "a szoftver teljesen elszállt, újra kell indítani"-ként él
// meg. Ezzel legalább egy visszaállítható hibaüzenetet lát helyette.
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Elkapott render-hiba:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="login-screen">
          <div className="login-card">
            <h1>Váratlan hiba történt</h1>
            <p className="chat-modal-hint">
              A program egy része hibába ütközött. A munkád máshol nem veszett el — próbáld újratölteni az
              alkalmazást.
            </p>
            <button type="button" className="ob-submit-btn" onClick={() => window.location.reload()}>
              Újratöltés
            </button>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}
