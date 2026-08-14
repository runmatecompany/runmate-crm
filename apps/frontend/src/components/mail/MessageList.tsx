import type { MailMessageSummary } from "../../lib/email";

interface MessageListProps {
  folder: "inbox" | "sent";
  onFolderChange: (folder: "inbox" | "sent") => void;
  hasSentFolder: boolean;
  messages: MailMessageSummary[];
  activeUid: number | null;
  onSelect: (uid: number) => void;
  onRefresh: () => void;
  onCompose: () => void;
  loading: boolean;
}

export default function MessageList({
  folder,
  onFolderChange,
  hasSentFolder,
  messages,
  activeUid,
  onSelect,
  onRefresh,
  onCompose,
  loading,
}: MessageListProps) {
  return (
    <div className="mail-message-list">
      <div className="mail-folder-tabs">
        <button
          type="button"
          className={folder === "inbox" ? "mail-folder-tab active" : "mail-folder-tab"}
          onClick={() => onFolderChange("inbox")}
        >
          Beérkezett
        </button>
        {hasSentFolder && (
          <button
            type="button"
            className={folder === "sent" ? "mail-folder-tab active" : "mail-folder-tab"}
            onClick={() => onFolderChange("sent")}
          >
            Elküldött
          </button>
        )}
        <span className="mail-folder-tabs-spacer" />
        <button type="button" className="chat-icon-btn" onClick={onRefresh} title="Frissítés">
          ⟳
        </button>
        <button type="button" className="chat-icon-btn" onClick={onCompose} title="Új levél">
          +
        </button>
      </div>
      <div className="mail-message-items">
        {loading && <p className="chat-empty-hint">Betöltés...</p>}
        {!loading && messages.length === 0 && <p className="chat-empty-hint">Nincs levél ebben a mappában.</p>}
        {messages.map((message) => (
          <button
            key={message.uid}
            type="button"
            className={
              "mail-message-item" +
              (message.uid === activeUid ? " active" : "") +
              (!message.seen ? " unread" : "")
            }
            onClick={() => onSelect(message.uid)}
          >
            <span className="mail-message-from">
              {message.from?.name || message.from?.address || "Ismeretlen feladó"}
            </span>
            <span className="mail-message-subject">{message.subject || "(nincs tárgy)"}</span>
            <span className="mail-message-date">
              {message.date ? new Date(message.date).toLocaleString("hu-HU") : ""}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
