import { useEffect, useState } from "react";
import { useAuth } from "../../lib/auth";
import { listColleagues, type Colleague } from "../../lib/chat";
import UserAccessModal from "./UserAccessModal";

export default function ProfilesSettings() {
  const { auth } = useAuth();
  const [colleagues, setColleagues] = useState<Colleague[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<Colleague | null>(null);

  useEffect(() => {
    if (!auth) return;
    listColleagues(auth.token)
      .then((list) => setColleagues(list.filter((c) => c.role !== "admin")))
      .finally(() => setLoading(false));
  }, [auth]);

  return (
    <div className="profiles-settings">
      <h1>Profilok</h1>
      <p className="chat-modal-hint">
        Válassz ki egy felhasználót, hogy beállítsd, mely modulokhoz (email fiókok, Leadek) férjen hozzá. Az
        adminisztrátorok mindig automatikusan mindenhez hozzáférnek.
      </p>

      {loading && <p className="chat-empty-hint">Betöltés...</p>}
      {!loading && colleagues.length === 0 && <p className="chat-empty-hint">Nincs még más kolléga.</p>}

      <ul className="profiles-list">
        {colleagues.map((c) => (
          <li key={c.id}>
            <button type="button" className="profiles-row" onClick={() => setSelectedUser(c)}>
              <span className="profiles-row-name">{c.name}</span>
              <span className="profiles-row-email">{c.email}</span>
            </button>
          </li>
        ))}
      </ul>

      {selectedUser && <UserAccessModal user={selectedUser} onClose={() => setSelectedUser(null)} />}
    </div>
  );
}
