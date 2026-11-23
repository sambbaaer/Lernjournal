# ADR 0001 – SQLite-Adapter: eingebautes `node:sqlite`

- **Status:** angenommen (Spike AJ-00a bestanden, 2026-11-23)
- **Kontext:** SPEC verlangt SQLite mit WAL, Fremdschlüsseln, Transaktionen, FTS5, konsistenten Online-Backups und Absturzsicherheit – im **gepackten** Electron-Build unter Windows mit abgeschalteter Fuse `RunAsNode`. Native Module (z. B. better-sqlite3) müssen für jede Electron-Version passend kompiliert bzw. als Prebuild geladen werden und sind eine häufige Ursache für defekte Builds.

## Entscheid
Wir verwenden das in Node/Electron **eingebaute Modul `node:sqlite`** (`DatabaseSync`, `backup()`), nur im Main-Prozess. Kein natives Zusatzmodul.

Getestete Versionen: Electron 45.4.1 (Node 24.22.3, SQLite 3.54.1).

## Ergebnis Spike AJ-00a
Alle Prüfungen bestanden in drei Umgebungen: Node 22 (Linux), Electron-Dev (Linux) und **gepackte EXE auf `windows-latest`** (ASAR, Fuses aktiv) sowie gepacktem Linux-Build.

| Prüfung | Ergebnis |
|---|---|
| WAL, `synchronous=FULL`, Fremdschlüssel, Unique-Beziehung, Cascade | ok |
| Rollback verwirft Teiländerungen | ok |
| FTS5 mit `unicode61 remove_diacritics 2`: Gross-/Kleinschreibung, Umlaute, Präfix, Snippet | ok |
| Online-Backup (`backup()`) während laufender Schreibzugriffe, `integrity_check` der Kopie | ok |
| Harter Abbruch (SIGKILL/TerminateProcess) des Schreibprozesses: keine bestätigte Transaktion verloren, Datei intakt | ok |
| Fuse `RunAsNode` aus → Absturztest-Prozess per `utilityProcess` statt `child_process.fork` | ok |

## Konsequenzen
- **+** Kein Rebuild bei Electron-Updates, keine Visual-Studio-Build-Tools, kleinere Installer, keine `asarUnpack`-Ausnahmen.
- **+** Synchrone API, passt zum Main-Prozess-Modell (kurze Transaktionen).
- **−** `node:sqlite` ist in Node 24 noch als experimentell bzw. Release Candidate markiert (Warnung beim ersten Laden). API-Änderungen sind möglich → alle DB-Zugriffe hinter einer eigenen, schmalen Repository-Schicht kapseln (`db/`), damit ein Wechsel auf better-sqlite3 lokal bleibt.
- **−** Lange Abfragen blockieren den Main-Prozess. Bei Bedarf (z. B. Neuaufbau Suchindex) in einen `utilityProcess` auslagern.
- Bei jedem Electron-Update: Spike-Checks (`spikes/aj-00a-sqlite`) als Regressionstest laufen lassen; später in die App-Tests überführen.

## Verworfen
- **better-sqlite3:** bewährt und schnell, aber natives Modul (ABI, Prebuilds, `asarUnpack`). Bleibt Rückfalloption.
- **sql.js / WASM:** keine echte Datei-Persistenz mit WAL, Backup nur als Komplettkopie im Speicher.
