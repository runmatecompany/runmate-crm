import { useState } from "react";
import { useAuth } from "../lib/auth";
import ProfileSettings from "../components/settings/ProfileSettings";
import EmailAccountsSettings from "../components/settings/EmailAccountsSettings";

interface SettingsSection {
  id: string;
  label: string;
}

export default function SettingsPage() {
  const { auth } = useAuth();
  const isAdmin = auth?.user.role === "admin";

  const sections: SettingsSection[] = [
    { id: "profile", label: "Profilom" },
    ...(isAdmin ? [{ id: "email-accounts", label: "Email fiókok" }] : []),
  ];

  const [activeSection, setActiveSection] = useState(sections[0].id);

  return (
    <main className="settings-page">
      <nav className="settings-nav">
        {sections.map((section) => (
          <button
            key={section.id}
            type="button"
            className={section.id === activeSection ? "settings-nav-item active" : "settings-nav-item"}
            onClick={() => setActiveSection(section.id)}
          >
            {section.label}
          </button>
        ))}
      </nav>
      <div className="settings-content">
        {activeSection === "profile" && <ProfileSettings />}
        {activeSection === "email-accounts" && isAdmin && <EmailAccountsSettings />}
      </div>
    </main>
  );
}
