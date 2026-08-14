import { useState } from "react";
import ProfileSettings from "../components/settings/ProfileSettings";

interface SettingsSection {
  id: string;
  label: string;
}

const SECTIONS: SettingsSection[] = [{ id: "profile", label: "Profilom" }];

interface SettingsPageProps {
  avatarVersion: number;
  onAvatarChange: () => void;
}

export default function SettingsPage({ avatarVersion, onAvatarChange }: SettingsPageProps) {
  const [activeSection, setActiveSection] = useState(SECTIONS[0].id);

  return (
    <main className="settings-page">
      <nav className="settings-nav">
        {SECTIONS.map((section) => (
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
        {activeSection === "profile" && (
          <ProfileSettings avatarVersion={avatarVersion} onAvatarChange={onAvatarChange} />
        )}
      </div>
    </main>
  );
}
