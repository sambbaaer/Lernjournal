# Agent-Anweisungen – Lernjournal

Lies README.md, docs/SPEC.md und docs/BACKLOG.md. SPEC ist massgeblich. Aktuell **nur Konzept, kein implementierter Code**.

- App-Name **Lernjournal**; Office-vertraute, eigenständige Desktop-UI, keine kopierten Microsoft-Assets.
- Windows, Electron + React/TS + Tiptap + SQLite + `docx`; offline-first.
- Ein Journal = ein Dokument; Fachbuch ist eine Sicht über dieselben Journale (Tags, Kategorien, Links, Suche), keine Duplikate.
- Editor: Auftrag, Durchführung, Reflexion, jeweils freie Rich-Text-Inhalte.
- Daten lokal als Projektordner; versionierte ZIP-Übergabe `.ajournal`; DOCX nur exportieren, nie stillschweigend synchronisieren.
- Keine Accounts, Cloud, KI, Klassenverwaltung oder Noten im MVP.
- Sicherheit: Electron `contextIsolation: true`, `nodeIntegration: false`, Sandbox, valide IPC, keine Renderer-FS/DB-Rechte.
- Migrationen, Datenintegrität, konsistente SQLite-Backups und Wiederherstellungstests obligatorisch.
- Texte Schweizer Hochdeutsch mit «…» und ss; Tastaturbedienung und gute Kontraste.
- Offizielle dpsuisse-Vorgaben nicht mit eigenen Bewertungsideen verwechseln.
- Pro Ticket Tests und Dokumentationspflege; aktuelle Bibliotheksversionen erst bei Implementierung prüfen.
