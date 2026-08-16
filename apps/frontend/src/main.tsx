import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// A Drive-böngésző drag&drop feltöltéséhez a Tauri ablak dragDropEnabled
// beállítása false (lásd tauri.conf.json), különben a natív ablak-réteg
// elkapná a fájl-dobást a webview HTML5 drag/drop eseményei elől. Enélkül
// viszont az app BÁRMELY más pontjára húzott fájlnál a böngésző alap-
// viselkedése (a fájl megnyitása, kinavigálva az appból) érvényesülne —
// ezt globálisan blokkoljuk, a konkrét feltöltési logika (DriveView.tsx)
// saját onDrop kezelője emiatt még ugyanúgy lefut.
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => e.preventDefault());

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
