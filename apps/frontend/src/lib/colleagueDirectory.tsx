import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "./auth";
import { useRealtime } from "./realtime";
import { listColleagues, type Colleague } from "./chat";

interface ColleagueDirectoryValue {
  getColleague: (id: number) => Colleague | undefined;
}

const ColleagueDirectoryContext = createContext<ColleagueDirectoryValue | undefined>(undefined);

// Egyetlen közös, app-szintű kollégalista-cache (id, név, telefon, email,
// szerep) — ezt olvassa ki az Avatar komponens, amikor valaki rákattint egy
// kolléga avatárjára, hogy elérhetőségi buborékot tudjon mutatni anélkül,
// hogy minden egyes Avatar-hívási helyen külön le kellene kérdezni/át kellene
// adni ezt az adatot propként.
export function ColleagueDirectoryProvider({ children }: { children: ReactNode }) {
  const { auth } = useAuth();
  const { onFrame } = useRealtime();
  const [colleagues, setColleagues] = useState<Colleague[]>([]);

  useEffect(() => {
    if (!auth) return;
    listColleagues(auth.token)
      .then(setColleagues)
      .catch(() => {});
  }, [auth]);

  useEffect(() => {
    return onFrame("profile-updated", (frame) => {
      setColleagues((prev) =>
        prev.map((c) =>
          c.id === frame.userId
            ? {
                ...c,
                name: frame.name ?? c.name,
                phone: frame.phone !== undefined ? frame.phone : c.phone,
              }
            : c
        )
      );
    });
  }, [onFrame]);

  function getColleague(id: number) {
    return colleagues.find((c) => c.id === id);
  }

  return (
    <ColleagueDirectoryContext.Provider value={{ getColleague }}>{children}</ColleagueDirectoryContext.Provider>
  );
}

export function useColleagueDirectory(): ColleagueDirectoryValue {
  const ctx = useContext(ColleagueDirectoryContext);
  if (!ctx) {
    throw new Error("useColleagueDirectory must be used within a ColleagueDirectoryProvider");
  }
  return ctx;
}
