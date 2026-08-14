import { AuthProvider, useAuth } from "./lib/auth";
import { RealtimeProvider } from "./lib/realtime";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import "./App.css";

function Screen() {
  const { auth } = useAuth();
  return auth ? <DashboardPage /> : <LoginPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <RealtimeProvider>
        <Screen />
      </RealtimeProvider>
    </AuthProvider>
  );
}
