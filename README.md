# Lernjournal

Offlinefähige Windows-Desktop-App für Lernende Medientechnolog*innen EFZ zum Führen der obligatorischen Lerndokumentation (BiVo Art. 12) und zur Vorbereitung auf das Qualifikationsverfahren. **Ein Arbeitsjournal ist ein eigenständiges Dokument; alle Journale bilden über Kategorien, Tags, Links und Volltextsuche ein persönliches Fachbuch.**

**Status:** Phase 0, Grundgerüst (AJ-01) und Office-ähnliche Oberfläche (AJ-02), Datenbank (AJ-04) und Projekte mit Einrichtungsassistent (AJ-03) Journalverwaltung (AJ-05), Texteditor (AJ-06), Bilder mit Legenden (AJ-07) und absturzsicheres Speichern (AJ-08) sowie Kategorien und Schlagwörter (AJ-09), Journal-Verknüpfungen (AJ-10), das Fachbuch mit Volltextsuche (AJ-11) der Word-Export einzelner Journale (AJ-12) und mehrerer Journale in einem Dokument mit Titelseite und Inhaltsverzeichnis (AJ-13) sowie die geprüfte Projektübergabe als `.ajournal`-Datei für den Umzug auf einen anderen Computer (AJ-14) automatische Sicherungen mit Wiederherstellung und Erinnerung an eine Kopie ausserhalb des Computers (AJ-15) sowie die Paketierung für Windows mit Offline-Selbsttest (AJ-16) und die Verteilung über den Microsoft Store als MSIX plus portable EXE (AJ-16b) fertig. Die P0-Abnahme (AJ-17) ist im automatisierten Teil bestanden ([docs/ABNAHME.md](docs/ABNAHME.md)); offen sind manuelle Prüfungen und der Pilot mit Lernenden ([docs/PILOT.md](docs/PILOT.md)). Start: siehe [docs/ENTWICKLUNG.md](docs/ENTWICKLUNG.md). **Produktname:** Lernjournal, neutrale Marke.

## Installation und Build
- **Für Lernende:** Lernjournal aus dem **Microsoft Store** installieren (ohne Adminrechte; Veröffentlichung in Vorbereitung, [docs/STORE.md](docs/STORE.md)). Ist der Store gesperrt: `Lernjournal-Portable-<Version>.exe` ohne Installation. Der NSIS-Installer `Lernjournal-Setup-<Version>.exe` bleibt als Testinstaller bzw. für die Schul-IT. Daten liegen im selbst gewählten Projektordner; Deinstallieren löscht ihn nie. Windows 10/11, x64.
- **Für Schul-IT und Lehrbetriebe:** [docs/IT-MERKBLATT.md](docs/IT-MERKBLATT.md) (Speicherorte, keine Netzwerkverbindungen, Signaturstatus, Freigabe auf verwalteten Geräten).
- **Build:** `npm ci`, dann unter Windows `npm run dist:win` (alle drei Ziele zum Testen) bzw. `npm run dist:store` (Store-Paket) und `npm run dist:exe` (portable + Testinstaller) → `dist/`. Store-Identität, Code-Signing, Prüfung und Selbsttest: [docs/ENTWICKLUNG.md](docs/ENTWICKLUNG.md#paketierung-release-und-code-signing-aj-16-aj-16b). Die Windows-CI baut alle drei bei jedem Push, installiert das MSIX mit Testzertifikat und legt die Pakete als Artefakte ab.

## Fixe Entscheidungen
- Electron, React, TypeScript, Tiptap, SQLite (`node:sqlite`), Tailwind CSS, `docx`, electron-builder.
- Verteilung über den Microsoft Store (MSIX) und als portable EXE, NSIS-Installer als Testinstaller; offline-first, ohne Konto, Server oder KI.
- Vier Journalvorlagen mit frei editierbarem Rich Text. «Neues Journal» und Strg+N legen einen Lernbericht an. Im Menüband «Vorlagen» stehen zusätzlich ein freier Eintrag, Maschinenwerte und ein Arbeitsablauf bereit.
- Über «Abschnitt hinzufügen» lassen sich leere Abschnitte oder ganze Vorlagen an einen bestehenden Eintrag anhängen. Direkt daneben bietet der «Einfügen»-Knopf (sowie das Menüband und das Rechtsklick-Kontextmenü) schnelles Einfügen aus der Zwischenablage, «Nur Text übernehmen», Bilder, Tabellen und Print-Fachsymbole (`ΔE`, `µm`, `°C`, `±`, `×`, `g/m²` sowie `Win+.`). Überschriften und Reihenfolge sind frei änderbar. Datum, Lernort und Status stehen kompakt am Titel. Weitere Felder lassen sich unter «Journaldetails» öffnen.
- «Gespeichert» in der Statusleiste zeigt den bestätigten Speicherstand an und öffnet die Liste der Projektsicherungen zur Wiederherstellung. Daneben steht ein Word-typischer Dokument-Zoom (`80–150 %`, `Strg+Mausrad`, `Strg++`/`Strg+-`/`Strg+0`).
- Optionale, konfigurierbare Windows-11-Erinnerung (Opt-in im Einrichtungsassistenten und in den Einstellungen, Standard 30 Tage) mit den Aktionen «Neues Journal» und «Nicht jetzt».
- Lokaler Projektordner; vollständiger portabler `.ajournal`-ZIP-Export.
- PDF und bearbeitbares Word als Einzel- oder Sammelexport. Für die IPA/QV vorgemerkte Journale lassen sich im Export übernehmen und als PDF zusammenstellen.
- Einstellbares Farbschema mit Hell, Dunkel und Systemeinstellung.
- Optionaler lokaler MCP-Zugang unter «Einstellungen → MCP». Vorhandene Journale suchen, lesen, überarbeiten und verknüpfen. Neue Entwürfe lassen sich separat freigeben. Für Claude Desktop per Erweiterung mit einem Klick eingerichtet. [Was ist MCP und wie richte ich es ein?](docs/MCP.md).
- Eigenständige Windows-Titelleiste mit App-Symbol und nativen Fensterknöpfen, kompaktes Menüband, Datei-Menü und Dokumentfläche.
- Schweizer Hochdeutsch: «…», ss statt ß.

## Für Coding-Agents
1. [AGENTS.md](AGENTS.md) – kurze verbindliche Regeln
2. [docs/SPEC.md](docs/SPEC.md) – Architektur, UX, Daten, Abnahme
3. [docs/BACKLOG.md](docs/BACKLOG.md) – priorisierte Tickets
4. [docs/QUELLEN.md](docs/QUELLEN.md) – offizielle Grundlagen (BiVo, Bildungsplan, QV) und abgeleitete Anforderungen
5. [docs/ENTWICKLUNG.md](docs/ENTWICKLUNG.md) – Entwicklungsumgebung, Befehle, IPC-Muster
6. [docs/ABNAHME.md](docs/ABNAHME.md) – P0-Abnahme mit Nachweisen und manueller Checkliste, [docs/PILOT.md](docs/PILOT.md) – Pilot mit Lernenden
7. [docs/adr/](docs/adr/) – Architekturentscheide, [spikes/](spikes/) – Phase-0-Prototypen

MVP vollständig, wenn ein Lernender offline ein Projekt erstellen, Journale schreiben, Bilder einfügen, automatisch speichern, verknüpfen, durchsuchen, als Einzel-/Sammel-DOCX ausgeben und komplett sichern/wiederherstellen kann.
