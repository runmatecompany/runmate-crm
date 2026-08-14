import { useEffect, useState } from "react";
import Sidebar, { MENU_ITEMS } from "../components/Sidebar";
import { useAuth } from "../lib/auth";
import { useNavigation } from "../lib/navigation";
import ChatPage from "./ChatPage";
import MessagesPage from "./MessagesPage";
import SettingsPage from "./SettingsPage";

export default function DashboardPage() {
  const { auth, logout } = useAuth();
  const { requestedRoomId } = useNavigation();
  const [activeId, setActiveId] = useState(MENU_ITEMS[0].id);

  useEffect(() => {
    if (requestedRoomId != null) {
      setActiveId("chat");
    }
  }, [requestedRoomId]);

  const activeLabel = MENU_ITEMS.find((item) => item.id === activeId)?.label ?? "";

  return (
    <div className="app-shell">
      <Sidebar
        activeId={activeId}
        onSelect={setActiveId}
        userId={auth?.user.id ?? 0}
        userName={auth?.user.name ?? ""}
        onLogout={logout}
      />
      {activeId === "chat" ? (
        <ChatPage />
      ) : activeId === "messages" ? (
        <MessagesPage />
      ) : activeId === "settings" ? (
        <SettingsPage />
      ) : (
        <main className="content">
          <h1>{activeLabel}</h1>
          <p className="content-placeholder">Ez a szekció még nincs kidolgozva.</p>
        </main>
      )}
    </div>
  );
}
