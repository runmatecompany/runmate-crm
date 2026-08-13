import { createContext, useContext, useState, type ReactNode } from "react";
import { login as apiLogin, type LoginResponse } from "./api";

const STORAGE_KEY = "runmate-crm-auth";

interface AuthState {
  token: string;
  user: LoginResponse["user"];
}

interface AuthContextValue {
  auth: AuthState | null;
  login: (email: string, password: string, remember: boolean) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function loadStoredAuth(): AuthState | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthState;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState | null>(loadStoredAuth);

  async function login(email: string, password: string, remember: boolean) {
    const { token, user } = await apiLogin(email, password, remember);
    const next: AuthState = { token, user };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setAuth(next);
  }

  function logout() {
    localStorage.removeItem(STORAGE_KEY);
    setAuth(null);
  }

  return <AuthContext.Provider value={{ auth, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
