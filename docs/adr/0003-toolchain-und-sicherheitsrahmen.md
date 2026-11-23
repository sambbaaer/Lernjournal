# ADR 0003 – Toolchain und Sicherheitsrahmen der App

- **Status:** angenommen (AJ-01, 2026-11-23)

## Entscheid
- **Build:** electron-vite 6 (Vite 8) für Main, Preload und Renderer; electron-builder 26 für Windows-Installer (NSIS, pro Benutzer) und portable EXE.
- **Sprache:** TypeScript 6.0 (strict, `noUncheckedIndexedAccess`). TypeScript 7 erst, wenn typescript-eslint es unterstützt.
- **UI:** React 19, Tailwind CSS 4 (Design-Tokens in `styles.css`, Systemschrift Segoe UI, keine Web-Fonts).
- **Qualität:** ESLint 10 (Flat Config) + Prettier, Vitest 5 für Unit-Tests, Playwright (Electron-Modus) für E2E.
- **IPC:** Ein zentraler Vertrag (`src/shared/ipc.ts`) mit zod-Schemas. Ein Dispatcher prüft Absender-Frame, Kanal und Daten und antwortet immer mit einem Ergebnisobjekt (keine Stacktraces in die Oberfläche). Preload stellt nur benannte Funktionen bereit, nie `ipcRenderer`.
- **Laden der Oberfläche:** eigenes privilegiertes Protokoll `app://lernjournal/` statt `file://`, mit Pfad-Traversal-Schutz und CSP-Header.
- **Härtung:** `contextIsolation`, `sandbox`, `nodeIntegration: false`, Navigation/neue Fenster/Webview blockiert, alle Berechtigungen abgelehnt, Netzwerkanfragen ausser zur eigenen Herkunft blockiert, kein Anwendungsmenü (keine Reload-/DevTools-Kürzel), Single-Instance-Lock. Electron-Fuses im Build (RunAsNode, Inspect, NODE_OPTIONS aus; ASAR-Integrität an).
- **Rauchtest im gepackten Build:** Umgebungsvariable `LERNJOURNAL_SMOKE_TEST=1` lässt die App die Brücke prüfen und sich beenden, weil sich Playwright wegen der Fuses nicht mit der gepackten App verbinden kann.

## Verworfen
- **Electron Forge:** gute Alternative, aber SPEC und Spike setzen auf electron-builder.
- **`app.enableSandbox()`:** bringt neben `sandbox: true` pro Fenster keinen Zusatzschutz, zwingt aber den Netzwerkdienst in die Sandbox und bricht Tests in Linux-Containern (root) ab.
- **CSP-Meta-Tag:** würde im Entwicklungsmodus das Inline-Skript von React Fast Refresh blockieren; stattdessen CSP per Header (Produktion: Protokoll-Handler, Entwicklung: `onHeadersReceived`).

## Konsequenzen
- Neue Funktionen mit Dateisystem- oder DB-Zugriff entstehen immer als IPC-Befehl nach dem Muster in `docs/ENTWICKLUNG.md`.
- `style-src 'unsafe-inline'` ist erlaubt (React/Tiptap setzen Stilattribute); Skripte bleiben streng.
