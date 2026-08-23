import { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar";
import { useAuth } from "../lib/auth";
import { useNavigation } from "../lib/navigation";
import { MENU_ITEMS } from "../lib/menuItems";
import ChatPage from "./ChatPage";
import MessagesPage from "./MessagesPage";
import LeadsPage from "./LeadsPage";
import ClientsPage from "./ClientsPage";
import TasksPage from "./TasksPage";
import WebPage, { type WebTab } from "./WebPage";
import SocialMediaPage, { type SocialMediaTab } from "./SocialMediaPage";
import SupportPage from "./SupportPage";
import SettingsPage from "./SettingsPage";
import AdminPage, { type AdminTab } from "./AdminPage";

const SOCIAL_MEDIA_TABS: Record<string, SocialMediaTab> = {
  "social-status": "status",
  "social-kanban": "kanban",
  "social-post-queue": "post-queue",
  "social-shoot-calendar": "shoot-calendar",
  "social-content-calendar": "content-calendar",
  "social-drive": "drive",
};

const WEB_TABS: Record<string, WebTab> = {
  "web-status": "status",
  "web-projects": "projects",
};

const ADMIN_TABS: Record<string, AdminTab> = {
  "admin-accounts": "accounts",
  "admin-email": "email",
  "admin-social-media": "social-media",
};

export default function DashboardPage() {
  const { auth, logout } = useAuth();
  const { requestedRoomId, requestedOnboardingClientId } = useNavigation();
  const [activeId, setActiveId] = useState(MENU_ITEMS[0].id);

  useEffect(() => {
    if (requestedRoomId != null) {
      setActiveId("chat");
    }
  }, [requestedRoomId]);

  useEffect(() => {
    if (requestedOnboardingClientId != null) {
      setActiveId("clients");
    }
  }, [requestedOnboardingClientId]);

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
      ) : activeId === "tasks" ? (
        <TasksPage />
      ) : activeId in WEB_TABS ? (
        <WebPage tab={WEB_TABS[activeId]} />
      ) : activeId in SOCIAL_MEDIA_TABS ? (
        <SocialMediaPage tab={SOCIAL_MEDIA_TABS[activeId]} />
      ) : activeId === "support" ? (
        <SupportPage />
      ) : activeId === "settings" ? (
        <SettingsPage />
      ) : activeId in ADMIN_TABS ? (
        <AdminPage tab={ADMIN_TABS[activeId]} />
      ) : (
        <main className="content">
          <h1>{activeLabel}</h1>
          <p className="content-placeholder">Ez a szekció még nincs kidolgozva.</p>
        </main>
      )}
    </div>
  );
}
