import { useState } from "react";
import logo from "../assets/logo.png";
import { useUpdater } from "../lib/updater";
import { MENU_ITEMS } from "../lib/menuItems";
import Avatar from "./Avatar";

interface SidebarProps {
  activeId: string;
  onSelect: (id: string) => void;
  userId: number;
  userName: string;
  onLogout: () => void;
}

export default function Sidebar({ activeId, onSelect, userId, userName, onLogout }: SidebarProps) {
  const { status, installAndRestart } = useUpdater();
  const updateAvailable = status === "available" || status === "installing";
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

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
          return (
            <div key={item.id} className={item.children ? "sidebar-group sidebar-group-has-children" : "sidebar-group"}>
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
                  onClick={() => onSelect(item.children ? item.children[0].id : item.id)}
                >
                  {item.label}
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
        <button className="sidebar-logout" onClick={onLogout}>
          Kijelentkezés
        </button>
      </div>
    </aside>
  );
}
