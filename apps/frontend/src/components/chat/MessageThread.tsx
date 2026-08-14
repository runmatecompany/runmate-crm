import { useEffect, useRef } from "react";
import type { ChatMessage } from "../../lib/chat";
import { useRealtime } from "../../lib/realtime";

interface MessageThreadProps {
  messages: ChatMessage[];
  currentUserId: number;
}

export default function MessageThread({ messages, currentUserId }: MessageThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const { names } = useRealtime();

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
              <div className="chat-bubble-body">{msg.body}</div>
              <div className="chat-bubble-time">
                {new Date(msg.created_at).toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
