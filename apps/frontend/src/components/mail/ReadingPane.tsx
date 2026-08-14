import { useState, type SyntheticEvent } from "react";
import type { MailMessage } from "../../lib/email";

interface ReadingPaneProps {
  message: MailMessage | null;
  loading: boolean;
  onReply: () => void;
}

export default function ReadingPane({ message, loading, onReply }: ReadingPaneProps) {
  const [iframeHeight, setIframeHeight] = useState(200);

  function handleIframeLoad(e: SyntheticEvent<HTMLIFrameElement>) {
    const doc = e.currentTarget.contentWindow?.document;
    if (doc?.body) {
      setIframeHeight(doc.body.scrollHeight + 24);
    }
  }

  if (loading) {
    return (
      <div className="mail-reading-pane">
        <p className="mail-empty-state">Betöltés...</p>
      </div>
    );
  }

  if (!message) {
    return (
      <div className="mail-reading-pane">
        <p className="mail-empty-state">Válassz egy levelet a listából.</p>
      </div>
    );
  }

  return (
    <div className="mail-reading-pane">
      <div className="mail-reading-header">
        <h2>{message.subject || "(nincs tárgy)"}</h2>
        <div className="mail-reading-meta">
          <span>{message.from?.name || message.from?.address || "Ismeretlen feladó"}</span>
          {message.date && <span>{new Date(message.date).toLocaleString("hu-HU")}</span>}
        </div>
        <button type="button" className="mail-reply-btn" onClick={onReply}>
          Válasz
        </button>
      </div>
      <div className="mail-reading-body">
        {message.html ? (
          // A levél HTML tartalma nem megbízható forrás — sandbox-olt iframe-ben
          // jelenítjük meg, script/form/navigáció engedélyek nélkül, hogy egy
          // rosszindulatú email se futtathasson kódot az appban.
          <iframe
            className="mail-html-frame"
            style={{ height: iframeHeight }}
            sandbox=""
            srcDoc={message.html}
            onLoad={handleIframeLoad}
            title="Levél tartalma"
          />
        ) : (
          <pre className="mail-reading-text">{message.text || "(üres levél)"}</pre>
        )}
      </div>
    </div>
  );
}
