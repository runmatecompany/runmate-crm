import { useState } from "react";
import logo from "../assets/logo.png";
import { useUpdater } from "../lib/updater";
import { useRealtime } from "../lib/realtime";
import { MENU_ITEMS } from "../lib/menuItems";
import Avatar from "./Avatar";
import SupportRequestModal from "./support/SupportRequestModal";

interface SidebarProps {
  activeId: string;
  onSelect: (id: string) => void;
  userId: number;
  userName: string;
  onLogout: () => void;
}

export default function Sidebar({ activeId, onSelect, userId, userName, onLogout }: SidebarProps) {
  const { status, installAndRestart } = useUpdater();
  const { unreadCount } = useRealtime();
  const updateAvailable = status === "available" || status === "installing";
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [showSupportRequest, setShowSupportRequest] = useState(false);

  function toggleGroup(id: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <img src={logo} alt="" className="sidebar-brand-logo" />
        <span>RunMate CRM</span>
      </div>

      <nav className="sidebar-nav">
        {MENU_ITEMS.map((item) => {
          const isParentActive = item.id === activeId || (item.children?.some((c) => c.id === activeId) ?? false);
          const isCollapsed = collapsedGroups.has(item.id);
          const groupClasses = ["sidebar-group"];
          if (item.children) groupClasses.push("sidebar-group-has-children");
          if (item.children && isParentActive) groupClasses.push("sidebar-group-active");
          return (
            <div key={item.id} className={groupClasses.join(" ")}>
              <div className="sidebar-group-header">
                {item.children && (
                  <button
                    type="button"
                    className="sidebar-collapse-toggle"
                    aria-label={isCollapsed ? "Almenü megnyitása" : "Almenü becsukása"}
                    onClick={() => toggleGroup(item.id)}
                  >
                    {isCollapsed ? "▸" : "▾"}
                  </button>
                )}
                <button
                  className={isParentActive ? "sidebar-link active" : "sidebar-link"}
                  onClick={() => {
                    if (item.children) toggleGroup(item.id);
                    onSelect(item.children ? item.children[0].id : item.id);
                  }}
                >
                  <span>{item.label}</span>
                  {item.id === "chat" && unreadCount > 0 && (
                    <span className="sidebar-unread-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
                  )}
                </button>
              </div>
              {item.children && !isCollapsed && (
                <div className="sidebar-submenu">
                  {item.children.map((child) => (
                    <button
                      key={child.id}
                      className={child.id === activeId ? "sidebar-link sidebar-sublink active" : "sidebar-link sidebar-sublink"}
                      onClick={() => onSelect(child.id)}
                    >
                      {child.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        {updateAvailable ? (
          <button
            className="sidebar-update-btn"
            onClick={installAndRestart}
            disabled={status === "installing"}
          >
            <span className="sidebar-update-title">
              {status === "installing" ? "Frissítés folyamatban..." : "Frissítés elérhető"}
            </span>
            <span className="sidebar-update-sub">Frissítés és újraindítás</span>
          </button>
        ) : (
          <div className="sidebar-user">
            <Avatar userId={userId} name={userName} size={26} />
            <span>{userName}</span>
          </div>
        )}
        <button className="sidebar-support-btn" onClick={() => setShowSupportRequest(true)}>
          Support
        </button>
        <button className="sidebar-logout" onClick={onLogout}>
          Kijelentkezés
        </button>
      </div>

      {showSupportRequest && <SupportRequestModal onClose={() => setShowSupportRequest(false)} />}
    </aside>
  );
}
