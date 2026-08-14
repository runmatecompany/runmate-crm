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
}

const NavigationContext = createContext<NavigationValue | undefined>(undefined);

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [requestedRoomId, setRequestedRoomId] = useState<number | null>(null);
  const [viewingRoomId, setViewingRoomId] = useState<number | null>(null);

  const openChatRoom = useCallback((roomId: number) => {
    setRequestedRoomId(roomId);
  }, []);

  const clearRequestedRoom = useCallback(() => {
    setRequestedRoomId(null);
  }, []);

  return (
    <NavigationContext.Provider
      value={{ requestedRoomId, openChatRoom, clearRequestedRoom, viewingRoomId, setViewingRoomId }}
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
