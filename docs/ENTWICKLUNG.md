# Entwicklung – Lernjournal

## Voraussetzungen (Windows 11)
- **Node.js 24 LTS** (https://nodejs.org) – bringt npm mit.
- **Git**.
- Kein Visual Studio, kein Python: Die App braucht keine nativen Module (ADR 0001).

## Erste Schritte
```bash
npm ci
```
```bash
npm run dev
```
`npm run dev` startet Vite und Electron. Änderungen an der Oberfläche (`src/renderer`) erscheinen sofort, Änderungen am Hauptprozess (`src/main`) starten die App neu.

## Befehle
| Befehl | Zweck |
|---|---|
| `npm run dev` | Entwicklung mit Hot Reload |
| `npm run check` | Typen + Lint + Formatierung + Unit-Tests (vor jedem Commit) |
| `npm run format` | Code automatisch formatieren (Prettier) |
| `npm test` | Unit-Tests (Vitest) |
| `npm run test:e2e` | App bauen und Ende-zu-Ende-Test (Playwright) |
| `npm run dist:win` | Installer + portable EXE nach `dist/` |
| `npm run dist:dir` | Nur entpackter Build (schneller, zum Ausprobieren) |

## Ordnerstruktur
```
src/
  main/       Hauptprozess (Node): Fenster, Sicherheit, IPC, später DB und Dateien
  preload/    Brücke: stellt window.lernjournal bereit – sonst nichts
  renderer/   Oberfläche (React + Tailwind), läuft in der Sandbox
  shared/     Typen und IPC-Vertrag für alle drei Teile
e2e/          Ende-zu-Ende-Tests gegen die gebaute App
spikes/       Phase-0-Prototypen (nicht App-Code)
```

## Datenbank und Migrationen
```
src/main/db/
  connection.ts   openDatabase (WAL, synchronous=FULL, Fremdschlüssel), transaction, checkIntegrity
  schema-v1.ts    Grundschema – nach Veröffentlichung NIE mehr ändern
  migrations.ts   Liste aller Migrationen, migrate()
src/main/project/
  lock.ts         Projektsperre (project.lock)
```
- **Neue Spalte/Tabelle?** Nie `schema-v1.ts` ändern, sondern eine neue Migration `{ version: 2, name, up }` in `MIGRATIONS` anhängen und testen (alte Datei → neue Version, Daten bleiben).
- `migrate()` sichert bestehende Daten **vor** dem Umbau (SQLite-Backup-API), führt jede Migration in einer eigenen Transaktion aus und verweigert Dateien aus neueren Programmversionen.
- **Regeln, die immer gelten müssen**, gehören als `CHECK`/`UNIQUE`/Fremdschlüssel ins Schema, nicht nur in den Code. Achtung SQLite: Ein `CHECK`, der `NULL` ergibt, gilt als erfüllt – darum `IS` statt `=` bei Funktionen wie `date()`.
- Datenbankzugriffe nur im Hauptprozess; der Renderer bekommt Daten ausschliesslich über IPC.

## Projekte (Hauptprozess)
```
src/main/project/
  project-service.ts   anlegen, öffnen (Sperre → Integrität → Migration mit Backup), schliessen, Profil
  project-handlers.ts  IPC-Handler: Freigabeliste, Zuletzt-Liste, automatisches Öffnen
  path-guard.ts        nur Pfade aus Dialog/Zuletzt-Liste/Vorschlag
  sync-detect.ts       OneDrive/Dropbox/… erkennen (Warnung)
  recent.ts            Zuletzt-Liste in den Benutzerdaten (atomar geschrieben)
src/shared/bipla.ts    Vorschlag-Kategorien a–g aus dem Bildungsplan
```
- Der Projektdienst kennt kein Electron (testbar mit Vitest); Dialoge und App-Pfade werden in `src/main/index.ts` hineingereicht.
- E2E-Tests setzen `LERNJOURNAL_E2E_DIR`: eigene Benutzerdaten und «Dokumente» in einem Temp-Ordner (wirkt nur in der ungepackten App). `launchApp()` legt das Projekt über den echten Assistenten an.

## Oberfläche (Renderer)
```
src/renderer/src/
  state/      app-state.ts (Reducer), commands.ts (Befehle + Tastenkürzel),
              shortcuts.ts, regions.ts (F6) – reine Logik, mit Vitest getestet
  shell/      AppShell, Ribbon (+ ribbon-items.ts), NavigationPane, Backstage, StatusBar
  views/      Start, Journale, Fachbuch, Export, Einstellungen
```
- **Befehle** stehen genau einmal in `state/commands.ts` (Text, Kürzel, Verfügbarkeit). Menüband, Tooltips und Tastatur lesen daraus – nie Kürzel doppelt verdrahten.
- **Nicht verfügbare Befehle** bekommen `aria-disabled` und einen Grund (Tooltip), nicht `disabled` – so bleiben sie per Tastatur erreichbar.
- **Farben** nur über die Tokens in `styles.css` (Kontraste dort dokumentiert). Auswahl immer zusätzlich mit Rahmen/Balken markieren (Windows-Kontrastmodus).
- **Speicherstatus** nur anzeigen, wenn er zutrifft (`saveStatus`), sonst nichts.
- **E2E** (`e2e/shell.test.mjs`) prüft Tastatur, Fokus und Barrierefreiheit mit axe-core (WCAG 2.2 AA). Neue Ansichten in den axe-Test aufnehmen.

## Einen neuen IPC-Befehl hinzufügen (Muster)
1. **Vertrag** in `src/shared/ipc.ts`: Kanal mit zod-Schema für `request` und `response`.
2. **Brücke** in `src/shared/api.ts` (Typ) und `src/preload/index.ts` (Funktion) – fachlich benennen.
3. **Umsetzung** in `src/main/index.ts` im Objekt von `createIpcDispatcher`. TypeScript meldet einen Fehler, solange ein Kanal aus dem Vertrag fehlt.
4. **Test** in `src/main/*.test.ts`: gültige und ungültige Daten.

Der Rahmen (`src/main/ipc-handler.ts`) prüft automatisch Absender, Kanal und Daten und liefert immer `{ ok, data }` oder `{ ok: false, error }`.

## Sicherheitsregeln (Kurzfassung, Details SPEC)
- Renderer importiert nie `electron` oder `node:*` – ESLint verhindert das.
- Fenster nur über `secureWebPreferences()` erstellen.
- Oberfläche wird im fertigen Programm über `app://lernjournal/` geladen, mit strenger CSP; Internetzugriffe sind blockiert.
- Die gepackte App hat Debug- und Node-Schalter per Electron-Fuses abgeschaltet (`electron-builder.yml`).

## Abhängigkeiten
- `dependencies`: nur, was der **Hauptprozess zur Laufzeit** braucht (aktuell `zod`). Nur das landet im Installer.
- `devDependencies`: alles andere, auch React – Vite bündelt die Oberfläche ohnehin in eine Datei.
- Versionen sind exakt gepinnt. Aktualisieren bewusst und mit `npm run check` + `npm run test:e2e`.
- Bekannt: `npm audit` meldet eine mittlere Schwachstelle in `minimatch` innerhalb von electron-builder (nur Build-Zeit, nicht im Installer).
- TypeScript bleibt auf 6.0, bis typescript-eslint TypeScript 7 unterstützt.
