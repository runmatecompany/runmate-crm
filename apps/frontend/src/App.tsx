import { useEffect, useState } from "react";
import { AuthProvider, useAuth } from "./lib/auth";
import { RealtimeProvider } from "./lib/realtime";
import { CallProvider } from "./lib/call";
import { NavigationProvider } from "./lib/navigation";
import { checkServerReachable } from "./lib/setup";
import { getApiUrl } from "./lib/serverConfig";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import SetupWizard from "./pages/SetupWizard";
import CallOverlay from "./components/CallOverlay";
import ToastNotifications from "./components/ToastNotifications";
import logo from "./assets/logo.png";
import "./App.css";

function SplashScreen() {
  return (
    <main className="login-screen">
      <img src={logo} alt="RunMate CRM" className="login-logo" />
    </main>
  );
}

function Screen() {
  const { auth } = useAuth();
  const [checking, setChecking] = useState(true);
  const [serverReachable, setServerReachable] = useState(false);
  const [skipWizard, setSkipWizard] = useState(false);

  useEffect(() => {
    if (auth) {
      setChecking(false);
      return;
    }
    checkServerReachable(getApiUrl()).then((ok) => {
      setServerReachable(ok);
      setChecking(false);
    });
  }, [auth]);

  if (auth) return <DashboardPage />;
  if (checking) return <SplashScreen />;
  if (!serverReachable && !skipWizard) {
    return <SetupWizard onDone={() => setSkipWizard(true)} onSkip={() => setSkipWizard(true)} />;
  }
  return <LoginPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <RealtimeProvider>
        <NavigationProvider>
          <CallProvider>
            <Screen />
            <CallOverlay />
            <ToastNotifications />
          </CallProvider>
        </NavigationProvider>
      </RealtimeProvider>
    </AuthProvider>
  );
}
