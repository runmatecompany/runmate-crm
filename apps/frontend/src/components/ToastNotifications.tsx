import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../lib/auth";
import { useRealtime } from "../lib/realtime";
import { useNavigation } from "../lib/navigation";
import { listColleagues, type ChatMessage, type Colleague } from "../lib/chat";
import { buildMentionCandidates, messageMentionsUser } from "../lib/chatMentions";
import Avatar from "./Avatar";

interface Toast {
  id: string;
  roomId: number;
  senderId: number;
  senderName: string;
  body: string;
  mentionsMe: boolean;
}

const AUTO_DISMISS_MS = 6000;

export default function ToastNotifications() {
  const { auth } = useAuth();
  const { onChatMessage, names } = useRealtime();
  const { viewingRoomId, openChatRoom } = useNavigation();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [colleagues, setColleagues] = useState<Colleague[]>([]);
  const mentionCandidates = useMemo(() => buildMentionCandidates(colleagues), [colleagues]);

  useEffect(() => {
    if (!auth?.token) return;
    listColleagues(auth.token).then(setColleagues).catch(() => {});
  }, [auth?.token]);

  useEffect(() => {
    return onChatMessage((message: ChatMessage) => {
      if (!auth) return;
      if (message.sender_id === auth.user.id) return;
      if (message.room_id === viewingRoomId) return;

      const toast: Toast = {
        id: `${message.id}-${Date.now()}`,
        roomId: message.room_id,
        senderId: message.sender_id,
        senderName: names[message.sender_id] ?? message.sender_name,
        body: message.body,
        mentionsMe: messageMentionsUser(message.body, mentionCandidates, auth.user.id),
      };
      setToasts((prev) => [...prev, toast]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, AUTO_DISMISS_MS);
    });
  }, [onChatMessage, auth, viewingRoomId, names, mentionCandidates]);

  function handleClick(toast: Toast) {
    openChatRoom(toast.roomId);
    setToasts((prev) => prev.filter((t) => t.id !== toast.id));
  }

  if (toasts.length === 0) return null;

  return (
    <div className="toast-stack">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          className={toast.mentionsMe ? "toast-card toast-card-mention" : "toast-card"}
          onClick={() => handleClick(toast)}
        >
          <Avatar userId={toast.senderId} name={toast.senderName} size={32} />
          <div className="toast-text">
            <div className="toast-sender">
              {toast.senderName}
              {toast.mentionsMe && <span className="toast-mention-badge">Tagelve</span>}
            </div>
            <div className="toast-body">{toast.body}</div>
          </div>
        </button>
      ))}
    </div>
  );
}
