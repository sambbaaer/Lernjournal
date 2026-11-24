# ADR 0007 – Paketierung für Windows: Installer pro Benutzer, portable EXE, Signing über Umgebungsvariablen, Selbsttest

- **Status:** angenommen (AJ-16, 2026-11-24)

## Kontext
SPEC «Betrieb unter Windows»: Installer pro Benutzer **ohne Adminrechte** (NSIS, `perMachine: false`) plus portable EXE; Code-Signing einplanen (Azure Trusted Signing oder OV-Zertifikat), sonst SmartScreen-Warnungen; Hinweis an die Schul-IT als Dokument; kein Auto-Update (Update = neue Version installieren, Daten bleiben im Projektordner); Windows 10 22H2 und 11 (x64), ARM64 nach Möglichkeit. P0-Abnahme 10: komplett offline, Installer und portabler Build auf sauberem Windows getestet. Seit AJ-01 gab es eine Grundkonfiguration (`electron-builder.yml`) mit Fuses und einen Rauchtest, der nur die Brücke prüfte (ADR 0003). Playwright kann sich wegen der Fuses nicht mit dem gepackten Programm verbinden.

## Entscheid
**Konfiguration als TypeScript** (`electron-builder.ts`, von electron-builder 26 selbst gefunden): typisiert, in Vitest importierbar (`scripts/packaging.test.ts`) und von `scripts/verify-package.mjs` als einzige Quelle der erwarteten Fuses gelesen.

**Installer (NSIS):** ein Klick (`oneClick`), pro Benutzer, kein Elevate-Hilfsprogramm (`packElevateHelper: false`), Deutsch, Verknüpfungen in Startmenü und auf dem Desktop, App startet nach der Installation. Ziel `%LOCALAPPDATA%\Programs\Lernjournal`, Registry nur unter `HKEY_CURRENT_USER`. Keine Ordnerwahl: Das Programm enthält keine Daten, die Lernenden wählen ihren Projektordner in der App (Einfachheit). Deinstallieren entfernt nur das Programm; Projektordner liegen ausserhalb, `%APPDATA%\Lernjournal` (Zuletzt-Liste) bleibt (`deleteAppDataOnUninstall: false`).

**Portable EXE:** entpackt sich bei jedem Start nach `%TEMP%\Lernjournal-Portable` (fester Name, damit die IT eine Regel formulieren kann) und räumt beim Beenden auf. Gleiche App-Daten wie die installierte Version. electron-builder legt in die portable EXE (und danach nach `win-unpacked`) immer sein Hilfsprogramm `elevate.exe` – für `portable` gibt es keine Einstellung dagegen. Lernjournal ruft es nie auf; `verify-package.mjs` lässt es nur dort als Hinweis zu, die CI prüft, dass die Installation es nicht enthält.

**Nur x64.** Ein ARM64-Build verdoppelt Grösse und Testaufwand; ARM64 bleibt «nach Möglichkeit» offen (IT-Merkblatt).

**Schlankes Paket:** `app.asar` enthält nur `out/**`, `package.json` und die Laufzeitabhängigkeiten. Ausgeschlossen: Source Maps, Typdateien, die Browser-Fassungen von `docx` (IIFE/UMD) und die TypeScript-Quellen von `zod` – `app.asar` schrumpft von 28,5 auf 13,7 MB. Sprachdateien nur `de` und `en-US`. `npmRebuild: false` (keine nativen Module, ADR 0001).

**Kein Auto-Update:** `publish: null` – dadurch entsteht auch keine `app-update.yml` mit Server-Adresse im Paket; keine Blockmap (`differentialPackage: false`).

**Keine Dateizuordnung `.ajournal`.** Pro Benutzer wäre sie ohne Adminrechte möglich (HKCU), aber die SPEC sieht den Import über Datei-Menü und Startbildschirm vor; ein Doppelklick bräuchte zusätzlich Pfade aus der Befehlszeile im Hauptprozess (neue Eingangstür am Pfad-Guard vorbei). Bei Bedarf als eigenes Ticket.

**Code-Signing nur über Umgebungsvariablen**, nie Dateien oder Passwörter im Repository:
- Zertifikat (OV/EV als `.pfx`): `CSC_LINK` (Pfad, HTTPS-URL oder Base64) und `CSC_KEY_PASSWORD` – liest electron-builder selbst; signiert wird mit SHA-256 und RFC-3161-Zeitstempel.
- Azure Trusted Signing: `LERNJOURNAL_AZURE_SIGN_ENDPOINT`, `…_ACCOUNT`, `…_PROFILE`, `…_PUBLISHER` (alle vier, sonst bricht die Konfiguration mit Meldung ab) plus Anmeldung über `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`.
- `LERNJOURNAL_REQUIRE_SIGNING=1` setzt `forceCodeSigning`: Ein Release-Build bricht ab statt unsigniert zu entstehen.
- Ohne Variablen: unsignierter Build ohne Fehler (Entwicklung, CI).

**Selbsttest im Programm** (`src/main/self-test.ts`, erweitert den Rauchtest aus ADR 0003): Mit `LERNJOURNAL_SMOKE_TEST=create|reopen` und einem Arbeitsordner (`LERNJOURNAL_SMOKE_DIR`, dort liegen dann Benutzerdaten und «Dokumente») steuert sich das Programm über die **echte Brücke** aus der gesandboxten Oberfläche: Projekt anlegen, Journal mit WebP-Bild, Suche, Word-Export (inkl. WebP → PNG im verborgenen Fenster), `.ajournal`-Export, schliessen; nach Neustart: Projekt öffnet von selbst, Inhalt, Suche, Sicherung vorhanden, Import der `.ajournal`-Datei in einen neuen Ordner. Speichern-Dialoge bestätigen im Selbsttest den Vorschlag. Das Programm schreibt einen Bericht und beendet sich mit Exitcode 0/1. `scripts/self-test.mjs` startet die Phasen von aussen und versucht zusätzlich in einer Phase `fuses`, die EXE mit `ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS` und `--inspect` zu missbrauchen (Gegenprobe mit dem ungepackten Electron: alle drei werden erkannt).

**Offline-Nachweis über das Chromium-Netzwerkprotokoll** (`--log-net-log`): Es erfasst auch Anfragen des Browser-Prozesses, die an `session.webRequest` vorbeigehen. Gefunden wurde so der Download des Hunspell-Wörterbuchs der Rechtschreibprüfung (`redirector.gvt1.com`, unter Linux nachgewiesen). Die Download-Adresse zeigt jetzt auf das eigene Protokoll `app://lernjournal/spellcheck/` – der Download scheitert lokal, ohne Verbindung. Der Selbsttest verlangt ein Protokoll ohne Verbindung, Namensauflösung oder Anfrage an einen fremden Host. Die CI sperrt zusätzlich ausgehende Verbindungen der App per Windows-Firewall.

**CI** (`.github/workflows/ci.yml`, Job `paket`, unabhängig vom Testjob): bauen, `verify-package.mjs` (Fuses, Inhalt von `app.asar`, keine Dev-Pakete, nichts ausgepackt, Manifest `asInvoker` bei Installer, portabler EXE und Programm, SHA-256-Prüfsummen), Selbsttest der entpackten, der installierten und der portablen App, stille Installation (`/S`) mit Prüfung von Zielordner, HKCU-Eintrag und Startmenü, stille Deinstallation mit Prüfung, dass Projektordner und App-Daten bleiben. Installer und portable EXE sowie Prüfberichte und Netzwerkprotokolle als Artefakte.

## Konsequenzen
- **+** Abnahme der Paketierung läuft bei jedem Push auf echtem Windows, mit dem gepackten Programm samt Fuses und ASAR-Integrität.
- **+** Der Offline-Anspruch ist messbar statt behauptet; neue Netzwerkzugriffe (auch aus Chromium) fallen im Selbsttest auf.
- **−** Rechtschreibprüfung: Wo Chromium Hunspell braucht, gibt es ohne Wörterbuch keine Prüfung. Was unter Windows geschieht, zeigt das Feld `spellcheck` im CI-Bericht; offen, bis auf echtem Windows angeschaut.
- **−** Die Fuse- und Installer-Prüfungen laufen nur unter Windows in der CI; unter Linux ist ein Cross-Build ohne Wine nicht möglich (NSIS braucht Wine für das Deinstallationsprogramm). Lokal prüfbar: `--linux dir` und `--win dir`-Inhalt, Selbsttest unter Linux.
- **−** Die CI läuft mit Adminkonto; der Nachweis «ohne Adminrechte» stützt sich auf Manifest (`asInvoker`), Zielordner und HKCU. Ein Test mit einem Standardkonto auf einem Schul-/Firmengerät bleibt manuell (AJ-17).
- Der Selbsttest ist im ausgelieferten Programm vorhanden, wirkt aber nur mit der Umgebungsvariable und schreibt nur in den angegebenen Arbeitsordner. Wer Umgebungsvariablen eines Benutzers setzen kann, hat ohnehin dessen Rechte.

## Verworfen
- **Assistent mit Ordnerwahl / `perMachine`-Option:** mehr Klicks, und die Option «für alle Benutzer» würde Adminrechte anfordern.
- **MSI/AppX:** MSI-Verteilung ist für Lehrbetriebe denkbar, aber nicht SPEC; AppX/MSIX verlangt Signatur und Store/Sideloading.
- **Auto-Update (electron-updater):** widerspricht offline-first; frühestens als «Nach neuer Version suchen» per Klick (SPEC «optional später»).
- **Wörterbücher mitliefern:** Lizenz (GPL/LGPL der deutschen Hunspell-Wörterbücher) und Grösse; erst prüfen, falls die Windows-Rechtschreibprüfung nicht greift.
