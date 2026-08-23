# RunMate CRM

Asztali CRM alkalmazás marketing ügynökség számára. Stack: **Tauri** (asztali shell) + **React/TypeScript** (frontend) + **Node.js/Fastify** (backend API) + **PostgreSQL** (adatbázis).

## Projekt felépítés

```
RUNMATE_CRM/
├── apps/
│   ├── backend/          Fastify API szerver (TypeScript)
│   │   ├── src/
│   │   │   ├── db/           pg Pool, migrációk, users query-k
│   │   │   ├── plugins/      @fastify/jwt beállítás, authenticate/requireAdmin
│   │   │   ├── routes/       /auth/login, /admin/users/*
│   │   │   └── scripts/      create-admin.ts (bootstrap admin user)
│   │   └── .env.example
│   └── frontend/         Tauri + React asztali alkalmazás
│       ├── src/               React kód (login, dashboard, sidebar)
│       └── src-tauri/          Rust/Tauri konfiguráció
└── package.json          npm workspaces root
```

Két külön npm workspace van (`apps/backend`, `apps/frontend`), amit a gyökér `package.json` fog össze — egy `npm install` a gyökérből mindkettőt telepíti.

## Előfeltételek

- Node.js (megvan)
- Rust toolchain (`rustc`, `cargo`) — a Tauri ezzel fordítja az asztali app natív részét
- PostgreSQL szerver, fut és elérhető

## Első indítás

1. **Függőségek telepítése** (gyökérből, mindkét workspace-hez):
   ```
   npm install
   ```

2. **Backend `.env` beállítása**: másold le `apps/backend/.env.example`-t `apps/backend/.env` néven, és töltsd ki a `DATABASE_URL`-t és egy random `JWT_SECRET`-et.

3. **Adatbázis migráció** (létrehozza a `users` táblát):
   ```
   npm run migrate
   ```

4. **Első admin felhasználó létrehozása** (nincs publikus regisztráció, ezzel bootstrapelsz). Fontos: közvetlenül a `backend` workspace-en keresztül kell hívni, mert az argumentumok a gyökér-wrapperen keresztül nem adódnak át helyesen:
   ```
   npm run create-admin --workspace=apps/backend -- --name="Teszt Elek" --email="admin@example.com" --password="ErosJelszo123"
   ```

5. **Backend indítása fejlesztői módban**:
   ```
   npm run dev:backend
   ```
   Fut: `http://127.0.0.1:3001`

6. **Frontend (Tauri) indítása fejlesztői módban** (külön terminálban, amíg a backend fut):
   ```
   npm run dev:frontend
   ```
   Ez megnyitja az asztali alkalmazás ablakát a bejelentkezési képernyővel.

## API végpontok (backend)

| Metódus | Útvonal | Leírás | Jogosultság |
|---|---|---|---|
| POST | `/auth/login` | email + jelszó → JWT token | nyilvános |
| GET | `/auth/me` | bejelentkezett felhasználó adatai | bejelentkezve |
| GET | `/admin/users` | felhasználók listázása | admin |
| POST | `/admin/users` | új felhasználó létrehozása | admin |
| POST | `/admin/users/:id/reset-password` | jelszó reset | admin |

## Csapatban használat: központi szerver + kliens telepítők

A CRM közös, megosztott adatbázissal működik: a **backend + PostgreSQL egy központi gépen fut** (pl. a te gépeden, vagy egy irodai/felhő szerveren), és minden kolléga a saját gépére telepített **kliens alkalmazás** (Tauri app) ehhez a központi szerverhez csatlakozik a hálózaton keresztül. Nem kell mindenkinek külön PostgreSQL-t és Node-ot telepítenie — csak a backendet üzemeltető gépnek.

### 1. Központi szerver beüzemelése (egyszer, azon a gépen ahol a backend fog futni)

Kövesd a fenti "Első indítás" lépéseket (1-5), majd:

- A `apps/backend/src/server.ts` már `0.0.0.0`-n hallgat, tehát a helyi hálózat más gépeiről is elérhető, nem csak lokálisan.
- Derítsd ki a szerver gép helyi IP-címét: PowerShell-ben `ipconfig` → "IPv4 Address" (pl. `192.168.1.50`).
- **Tűzfal**: Windows Defender Firewall alapból blokkolja a bejövő kapcsolatokat a 3001-es porton. Ezt a szervergépen, adminisztrátori PowerShell-ben kell engedélyezni (ezt szándékosan nem futtatom automatikusan, mert biztonsági hatása van — te döntsd el, mikor):
  ```
  New-NetFirewallRule -DisplayName "RunMate CRM backend" -Direction Inbound -Protocol TCP -LocalPort 3001 -Action Allow
  ```
- Éles használatra érdemes a backendet lefordítva, `npm run build --workspace=apps/backend` majd `npm start --workspace=apps/backend` paranccsal futtatni a `tsx watch` helyett (stabilabb, nem fejlesztői mód).

### 2. Kliens telepítő build (Windows .exe / macOS .dmg)

Ezt a GitHub Actions CI végzi automatikusan mindkét platformra (`.github/workflows/build.yml`), mivel macOS csomagot Windows gépről nem lehet natívan fordítani. Új verzió kiadásához:

```
git tag v0.1.0
git push origin v0.1.0
```

Ez elindítja a buildet GitHub Actions-ben, ami egy **draft (nem publikus) GitHub Release**-t hoz létre a repo "Releases" oldalán, csatolva:
- Windows: `RunMate CRM_x.y.z_x64-setup.exe` (egyetlen telepítő fájl)
- macOS: `RunMate CRM_x.y.z_universal.dmg`

A draft release-t a GitHub felületén nézed át, majd "Publish"-eled — utána tudod letölteni és odaadni a kollégáknak a megfelelő fájlt a saját operációs rendszerükhöz.

Helyben (csak Windows-hoz, mivel ezen a gépen dolgozunk) így is buildelhető telepítő tesztként:
```
npm run tauri --workspace=apps/frontend -- build
```
Az eredmény: `apps/frontend/src-tauri/target/release/bundle/nsis/RunMate CRM_x.y.z_x64-setup.exe`

### 3. Amit a kollégának tennie kell

1. Lefuttatja a kapott `...setup.exe` (Windows) vagy `.dmg` (macOS) telepítőt.
2. Első indításkor, ha az app nem éri el a szervert, automatikusan megjelenik egy **beüzemelő varázsló**, ami végigvezeti a Tailscale telepítésén és a céges hálózathoz csatlakozáson (lásd lent), majd ellenőrzi a kapcsolatot, mielőtt bejelentkezésre engedi. Nincs kézi "Szerver cím" beállítás — csak akkor kell hozzányúlni, ha valaki explicit "Kihagyom" gombbal kilép a varázslóból.
3. Ezután a tőled kapott email/jelszó párral bejelentkezik. (Új felhasználót az admin `/admin/users` végponton, vagy a `create-admin` scripttel a szervergépen tudsz létrehozni.)

### 4. Távoli elérés (nem ugyanazon a Wi-Fi/hálózaton) — Tailscale

A `192.168.x.x` jellegű LAN-cím csak akkor működik, ha a kolléga gépe **fizikailag ugyanazon a helyi hálózaton** van, mint a szervergép. Ha távolról (más hálózatról, mobilnetről) is el kell érni, [Tailscale](https://tailscale.com)-t használunk: egy ingyenes, titkosított privát hálózatot, ami router-beállítás nélkül összeköti a gépeket bárhonnan.

**Egyszeri beállítás a szervergépen** (már megtörtént ezen a gépen):
1. Tailscale telepítése + bejelentkezés (`tailscale up`).
2. A gép Tailscale-címe lekérdezhető: `tailscale ip -4` (formátuma: `100.x.x.x`).

**Minden új kolléga meghívása** (a géped tulajdonosaként, https://login.tailscale.com/admin/machines oldalon):
1. Keresd meg a szervergépet a listában → `...` menü → **"Share"**.
2. Küldd el neki a generált linket.
3. Ő telepíti a Tailscale appot ([tailscale.com/download](https://tailscale.com/download)), elfogadja a megosztást saját (ingyenes) fiókjával.
4. Ezután a CRM appban a szerver címe: `http://100.x.x.x:3001` (a szervergép Tailscale IP-jével, nem a LAN IP-vel) — ez bárhonnan működik, nem csak azonos Wi-Fi-n.

A tűzfalszabály (3. pont, "Központi szerver beüzemelése") a Tailscale-en érkező forgalmat is engedi, mert portalapú, nem hálózat-specifikus.
