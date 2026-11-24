# Agent-Anweisungen – Lernjournal

Lies README.md, docs/SPEC.md, docs/BACKLOG.md und docs/QUELLEN.md. SPEC ist massgeblich; QUELLEN.md trennt offizielle Vorgaben (BiVo, Bildungsplan, QV) von eigenen Produktentscheiden. Stand: Phase 0, AJ-01 (Grundgerüst) und AJ-02 (App-Shell) abgeschlossen; AJ-04 (Schema/Migrationen/Sperre) und AJ-03 (Projekt anlegen/öffnen) ebenfalls; AJ-05 (Journal-CRUD), AJ-06 (Editor), AJ-07 (Bilder) und AJ-08 (Autosave/Absturzsicherheit) ebenfalls – Phase 2 «Editor» komplett; AJ-09 (Kategorien/Tags), AJ-10 (Journal-Verknüpfungen) und AJ-11 (Fachbuch und FTS5-Suche) abgeschlossen – Phase 3 «Fachbuch» komplett; AJ-12 (Einzel-DOCX) und AJ-13 (Sammel-DOCX) abgeschlossen – Phase 4 «Word» komplett (Sichtprüfung in Word 365 offen); AJ-14 (.ajournal Import/Export), AJ-15 (Backup/Restore) und AJ-16 (Windows-Installer/portable EXE, IT-Merkblatt docs/IT-MERKBLATT.md) abgeschlossen; Phase 5: AJ-17 (Ende-zu-Ende-Abnahme) automatisiert abgenommen – alle 11 P0-Punkte belegt in docs/ABNAHME.md, Windows-CI grün; offen sind die manuellen Prüfungen (Word 365, zweiter PC, Standardbenutzer/verwaltetes Windows, 200 %/Kontrast/NVDA) und der Pilot (docs/PILOT.md). Nächster Schritt: Pilot durchführen, danach P1 mit AJ-18 (PDF). Entwicklungsanleitung und IPC-Muster: docs/ENTWICKLUNG.md. Vor jedem Commit `npm run check`.

- App-Name **Lernjournal**; Office-vertraute, eigenständige Desktop-UI, keine kopierten Microsoft-Assets.
- Windows, Electron + React/TS + Tiptap + SQLite (`node:sqlite`, ADR 0001) + `docx` (ADR 0002); offline-first.
- Ein Journal = ein Dokument; Fachbuch ist eine Sicht über dieselben Journale (Tags, Kategorien, Links, Suche), keine Duplikate.
- Editor: Auftrag, Durchführung, Reflexion, jeweils freie Rich-Text-Inhalte.
- Daten lokal als Projektordner; versionierte ZIP-Übergabe `.ajournal`; DOCX nur exportieren, nie stillschweigend synchronisieren.
- Keine Accounts, Cloud, KI, Klassenverwaltung oder Noten im MVP.
- Sicherheit: Electron `contextIsolation: true`, `nodeIntegration: false`, Sandbox, valide IPC, keine Renderer-FS/DB-Rechte.
- Migrationen, Datenintegrität, konsistente SQLite-Backups und Wiederherstellungstests obligatorisch.
- Texte Schweizer Hochdeutsch mit «…» und ss; Tastaturbedienung und gute Kontraste.
- Offizielle dpsuisse-/SBFI-Vorgaben nicht mit eigenen Bewertungsideen verwechseln; Zahlen aus Vorgaben (z. B. Anzahl QV-Lerndokumentationen) konfigurierbar halten, nie hart codieren.
- Fokus Fachrichtung **Print**; inoffizielles Hilfsmittel für Lernende, Einfachheit vor Vollständigkeit (alle Zuordnungen freiwillig).
- QV: mind. 12 Lernberichte, eingereicht mit der Aufgabenstellung **vor** der IPA, als PDF in PkOrg; Lerndokumentation ist Hilfsmittel während der IPA und wird nicht bewertet. Nicht mit dem IPA-«Arbeitsjournal» verwechseln.
- Ein Journal entspricht einer «Lerndokumentation» nach BiVo Art. 12; der Bildungsbericht ist Sache des Betriebs und kein App-Feature.
- Architekturentscheide als ADR unter docs/adr/; Spike-Code nur überführt (TS, Tests) übernehmen.
- Pro Ticket Tests und Dokumentationspflege; aktuelle Bibliotheksversionen erst bei Implementierung prüfen.

## Current Focus: Native Windows-11-Features, Word-Zoom, Fachsymbole & Opt-in Journal-Erinnerung
## Status: Completed
## Last Actions:
- «Einfügen»-Knopf neben «Abschnitt hinzufügen» um Print-Fachsymbole (`ΔE`, `µm`, `°C`, `±`, `×`, `g/m²` + `Win+.`) ergänzt; Rechtsklick-Kontextmenü um `Emoji und Symbole (Win+.)` erweitert.
- Word-typischer Dokument-Zoom (`80–150 %`, `- / 100 % / +` in der Statusleiste, `Strg+Mausrad`, `Strg++`, `Strg+-`, `Strg+0`) eingebaut.
- Windows 11 `backgroundMaterial: 'mica'`, Taskleisten-Fortschrittsbalken (`win.setProgressBar`) und Speicherung von Fenstergrösse/Position/Maximiert-Status (`window-state.ts`) umgesetzt.
- Opt-in Windows-11-Toast-Erinnerung & Infoleiste für neue Journale (im Onboarding-Assistenten und in den Einstellungen aktivierbar, Standard 30 Tage, frei konfigurierbar, mit «Neues Journal» und «Nicht jetzt» / 7-Tage-Snooze) eingebaut.
- «Im Explorer öffnen» für den Projektordner in Statusleiste und Einstellungen (`project:showFolder` via `shell.openPath`) umgesetzt – kompatibel mit Store-MSIX und Portable-EXE.
## Next Steps:
- Manuelle Prüfungen (Word 365, zweiter PC, verwaltetes Windows) und Pilot mit Lernenden gemäss `docs/PILOT.md`.
## Active Plans:
- `docs/SPEC.md`, `docs/BACKLOG.md`, `docs/ABNAHME.md`
