# Agent-Anweisungen – Lernjournal

Lies README.md, docs/SPEC.md, docs/BACKLOG.md und docs/QUELLEN.md. SPEC ist massgeblich; QUELLEN.md trennt offizielle Vorgaben (BiVo, Bildungsplan, QV) von eigenen Produktentscheiden. Stand: Phase 0, AJ-01 (Grundgerüst) und AJ-02 (App-Shell) abgeschlossen; AJ-04 (Schema/Migrationen/Sperre) und AJ-03 (Projekt anlegen/öffnen) ebenfalls; AJ-05 (Journal-CRUD), AJ-06 (Editor), AJ-07 (Bilder) und AJ-08 (Autosave/Absturzsicherheit) ebenfalls – Phase 2 «Editor» komplett; AJ-09 (Kategorien/Tags), AJ-10 (Journal-Verknüpfungen) und AJ-11 (Fachbuch und FTS5-Suche) abgeschlossen – Phase 3 «Fachbuch» komplett; AJ-12 (Einzel-DOCX) und AJ-13 (Sammel-DOCX) abgeschlossen – Phase 4 «Word» komplett (Sichtprüfung in Word 365 offen); AJ-14 (.ajournal Import/Export), AJ-15 (Backup/Restore) und AJ-16 (Paketierung, IT-Merkblatt docs/IT-MERKBLATT.md) abgeschlossen; AJ-16b (Microsoft Store als MSIX + portable EXE, NSIS als Testinstaller, ADR 0008, docs/STORE.md) abgeschlossen – offen: Partner-Center-Identität und Einreichung; Phase 5: AJ-17 (Ende-zu-Ende-Abnahme) automatisiert abgenommen – alle 11 P0-Punkte belegt in docs/ABNAHME.md, Windows-CI grün; offen sind die manuellen Prüfungen (Word 365, zweiter PC, Standardbenutzer/verwaltetes Windows, 200 %/Kontrast/NVDA) und der Pilot (docs/PILOT.md). Nächster Schritt: Pilot durchführen, danach P1 mit AJ-18 (PDF). Entwicklungsanleitung und IPC-Muster: docs/ENTWICKLUNG.md. Vor jedem Commit `npm run check`.

- App-Name **Lernjournal**; Office-vertraute, eigenständige Desktop-UI, keine kopierten Microsoft-Assets.
- Windows, Electron + React/TS + Tiptap + SQLite (`node:sqlite`, ADR 0001) + `docx` (ADR 0002); offline-first.
- Verteilung: Microsoft Store (MSIX) + portable EXE, NSIS nur als Testinstaller (ADR 0008); Store-Identität nur über `LERNJOURNAL_STORE_*`, nie ins Repo; nichts, was eine Deinstallation überleben muss, in AppData oder den Programmordner schreiben.
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

## Current Focus: Update 1 nach Store-Veröffentlichung (AJ-24–AJ-33)
## Status: Completed
## Last Actions:
- Paket A: Startseite ohne Doppelungen mit Fortschritt (Semester, QV), Menüband ausserhalb des Editors mit Schnellsuche und Filtern (zentraler Filter), Schnellsuche Strg+K, Störungstabelle.
- Paket B: Hinweisbox Merke/Achtung/Tipp, Checkliste, Rechenblock (ohne LaTeX), Querverweise «[[…]]» auf Journale, Schlagwörter (`lernjournal://tag/<uuid>`) und Merkstellen.
- Paket C: Bild-Schnellbeschriftung (nicht destruktiv, SVG für Editor/PDF, im Word zusammengerechnet), Merkstellen statt Wiki-Kopie (Fachbuch-Register A–Z, Sprung zur Stelle).
- Datenformat v7 (leere Migration als Schutz vor älteren Programmen), ADR 0012, SPEC v1.16, ENTWICKLUNG «Neue Editor-Bausteine».
- Davor: MCP repariert (fester Schlüssel, Claude-Desktop-Erweiterung `.mcpb`, docs/MCP.md, Nachtrag ADR 0011).
## Next Steps:
- Version für das Store-Update erhöhen und Release bauen; Erweiterung und neue Bausteine in Word 365 und Claude Desktop unter Windows prüfen.
- Manuelle Prüfungen und Pilot gemäss `docs/PILOT.md`; danach AJ-21/22 (Kompetenzkatalog, Abdeckung) inkl. Filter «Kompetenz».
## Active Plans:
- `docs/SPEC.md`, `docs/BACKLOG.md`, `docs/ABNAHME.md`
