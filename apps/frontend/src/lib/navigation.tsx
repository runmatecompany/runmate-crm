import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

interface NavigationValue {
  // Melyik chat szobát kérték megnyitni (pl. egy toast értesítésre kattintva).
  requestedRoomId: number | null;
  openChatRoom: (roomId: number) => void;
  clearRequestedRoom: () => void;
  // Melyik szobát nézi épp aktívan a felhasználó (a Chat oldalon) — ezt arra
  // használjuk, hogy ne jelenjen meg felesleges toast egy már nyitva lévő
  // beszélgetéshez.
  viewingRoomId: number | null;
  setViewingRoomId: (roomId: number | null) => void;
  // Melyik ügyfélnek kérték megnyitni az onboarding (AI-profil) formját —
  // lead→ügyfél konverzió után, hogy ne kelljen külön emlékezni rá.
  requestedOnboardingClientId: number | null;
  openClientOnboarding: (clientId: number) => void;
  clearRequestedOnboarding: () => void;
  // Melyik Drive-mappát kérték megnyitni a beépített Drive-böngészőben —
  // pl. a "Posztolni valók" listából, hogy egyből a megvágott videók
  // mappájában landoljon a felhasználó, ne külső böngészőben.
  requestedDriveFolderId: string | null;
  openDriveFolder: (folderId: string) => void;
  clearRequestedDriveFolder: () => void;
}

const NavigationContext = createContext<NavigationValue | undefined>(undefined);

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [requestedRoomId, setRequestedRoomId] = useState<number | null>(null);
  const [viewingRoomId, setViewingRoomId] = useState<number | null>(null);
  const [requestedOnboardingClientId, setRequestedOnboardingClientId] = useState<number | null>(null);
  const [requestedDriveFolderId, setRequestedDriveFolderId] = useState<string | null>(null);

  const openChatRoom = useCallback((roomId: number) => {
    setRequestedRoomId(roomId);
  }, []);

  const clearRequestedRoom = useCallback(() => {
    setRequestedRoomId(null);
  }, []);

  const openClientOnboarding = useCallback((clientId: number) => {
    setRequestedOnboardingClientId(clientId);
  }, []);

  const clearRequestedOnboarding = useCallback(() => {
    setRequestedOnboardingClientId(null);
  }, []);

  const openDriveFolder = useCallback((folderId: string) => {
    setRequestedDriveFolderId(folderId);
  }, []);

  const clearRequestedDriveFolder = useCallback(() => {
    setRequestedDriveFolderId(null);
  }, []);

  return (
    <NavigationContext.Provider
      value={{
        requestedRoomId,
        openChatRoom,
        clearRequestedRoom,
        viewingRoomId,
        setViewingRoomId,
        requestedOnboardingClientId,
        openClientOnboarding,
        clearRequestedOnboarding,
        requestedDriveFolderId,
        openDriveFolder,
        clearRequestedDriveFolder,
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation(): NavigationValue {
  const ctx = useContext(NavigationContext);
  if (!ctx) {
    throw new Error("useNavigation must be used within a NavigationProvider");
  }
  return ctx;
}
