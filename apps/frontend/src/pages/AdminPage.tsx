import ProfilesSettings from "../components/settings/ProfilesSettings";
import EmailAccountsSettings from "../components/settings/EmailAccountsSettings";
import SocialMediaSettings from "../components/settings/SocialMediaSettings";
import BillingSettings from "../components/settings/BillingSettings";

export type AdminTab = "accounts" | "email" | "social-media" | "billing";

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
        {tab === "billing" && <BillingSettings />}
      </div>
    </main>
  );
}
