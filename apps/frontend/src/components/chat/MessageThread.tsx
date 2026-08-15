import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../lib/auth";
import { fetchChatImageBlobUrl, type ChatMessage } from "../../lib/chat";
import { useRealtime } from "../../lib/realtime";

interface MessageThreadProps {
  messages: ChatMessage[];
  currentUserId: number;
}

function ChatImage({ messageId, onOpen }: { messageId: number; onOpen: (url: string) => void }) {
  const { auth } = useAuth();
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!auth?.token) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    fetchChatImageBlobUrl(auth.token, messageId).then((blobUrl) => {
      if (cancelled) {
        if (blobUrl) URL.revokeObjectURL(blobUrl);
        return;
      }
      objectUrl = blobUrl;
      setUrl(blobUrl);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [auth?.token, messageId]);

  if (!url) return <div className="chat-bubble-image chat-bubble-image-loading" />;
  return (
    <img
      src={url}
      alt="Elküldött kép"
      className="chat-bubble-image"
      onClick={() => onOpen(url)}
    />
  );
}

function ReceiptTick({ message }: { message: ChatMessage }) {
  if (message.read_at) {
    return (
      <span className="chat-receipt read" title="Elolvasva">
        ✓✓
      </span>
    );
  }
  if (message.delivered_at) {
    return (
      <span className="chat-receipt delivered" title="Kézbesítve">
        ✓✓
      </span>
    );
  }
  return (
    <span className="chat-receipt sent" title="Elküldve">
      ✓
    </span>
  );
}

export default function MessageThread({ messages, currentUserId }: MessageThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const { names } = useRealtime();
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  return (
    <div className="chat-thread">
      {messages.map((msg) => {
        const mine = msg.sender_id === currentUserId;
        const senderName = names[msg.sender_id] ?? msg.sender_name;
        return (
          <div key={msg.id} className={mine ? "chat-bubble-row mine" : "chat-bubble-row"}>
            <div className="chat-bubble">
              {!mine && <div className="chat-bubble-sender">{senderName}</div>}
              {msg.has_image && <ChatImage messageId={msg.id} onOpen={setLightbox} />}
              {msg.body && <div className="chat-bubble-body">{msg.body}</div>}
              <div className="chat-bubble-time">
                {new Date(msg.created_at).toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" })}
                {mine && <ReceiptTick message={msg} />}
              </div>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />

      {lightbox && (
        <div className="chat-image-lightbox" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="Elküldött kép" />
        </div>
      )}
    </div>
  );
}
