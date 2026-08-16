import { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar";
import { useAuth } from "../lib/auth";
import { useNavigation } from "../lib/navigation";
import { MENU_ITEMS } from "../lib/menuItems";
import ChatPage from "./ChatPage";
import MessagesPage from "./MessagesPage";
import LeadsPage from "./LeadsPage";
import ClientsPage from "./ClientsPage";
import SocialMediaPage, { type SocialMediaTab } from "./SocialMediaPage";
import SettingsPage from "./SettingsPage";

const SOCIAL_MEDIA_TABS: Record<string, SocialMediaTab> = {
  "social-kanban": "kanban",
  "social-queue": "queue",
  "social-post-queue": "post-queue",
  "social-shoot-calendar": "shoot-calendar",
  "social-content-calendar": "content-calendar",
};

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
      ) : activeId === "leads" ? (
        <LeadsPage />
      ) : activeId === "clients" ? (
        <ClientsPage />
      ) : activeId in SOCIAL_MEDIA_TABS ? (
        <SocialMediaPage tab={SOCIAL_MEDIA_TABS[activeId]} />
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
