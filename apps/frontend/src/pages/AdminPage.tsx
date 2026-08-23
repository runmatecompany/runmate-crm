import ProfilesSettings from "../components/settings/ProfilesSettings";
import EmailAccountsSettings from "../components/settings/EmailAccountsSettings";
import SocialMediaSettings from "../components/settings/SocialMediaSettings";

export type AdminTab = "accounts" | "email" | "social-media";

interface AdminPageProps {
  tab: AdminTab;
}

export default function AdminPage({ tab }: AdminPageProps) {
  return (
    <main className="settings-page">
      <div className="settings-content">
        {tab === "accounts" && <ProfilesSettings />}
        {tab === "email" && <EmailAccountsSettings />}
        {tab === "social-media" && <SocialMediaSettings />}
      </div>
    </main>
  );
}
