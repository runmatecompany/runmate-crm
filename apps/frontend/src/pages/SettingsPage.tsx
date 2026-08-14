import { useState } from "react";
import ProfileSettings from "../components/settings/ProfileSettings";

interface SettingsSection {
  id: string;
  label: string;
}

const SECTIONS: SettingsSection[] = [{ id: "profile", label: "Profilom" }];

export default function SettingsPage() {
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
      <div className="settings-content">{activeSection === "profile" && <ProfileSettings />}</div>
    </main>
  );
}
