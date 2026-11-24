# Lernjournal

Offlinefähige Windows-Desktop-App für Lernende Medientechnolog*innen EFZ zum Führen der obligatorischen Lerndokumentation (BiVo Art. 12) und zur Vorbereitung auf das Qualifikationsverfahren. **Ein Arbeitsjournal ist ein eigenständiges Dokument; alle Journale bilden über Kategorien, Tags, Links und Volltextsuche ein persönliches Fachbuch.**

**Status:** Phase 0, Grundgerüst (AJ-01) und Office-ähnliche Oberfläche (AJ-02), Datenbank (AJ-04) und Projekte mit Einrichtungsassistent (AJ-03) Journalverwaltung (AJ-05), Texteditor (AJ-06), Bilder mit Legenden (AJ-07) und absturzsicheres Speichern (AJ-08) sowie Kategorien und Schlagwörter (AJ-09), Journal-Verknüpfungen (AJ-10), das Fachbuch mit Volltextsuche (AJ-11) der Word-Export einzelner Journale (AJ-12) und mehrerer Journale in einem Dokument mit Titelseite und Inhaltsverzeichnis (AJ-13) sowie die geprüfte Projektübergabe als `.ajournal`-Datei für den Umzug auf einen anderen Computer (AJ-14) automatische Sicherungen mit Wiederherstellung und Erinnerung an eine Kopie ausserhalb des Computers (AJ-15) sowie Windows-Installer ohne Adminrechte und portable EXE mit Offline-Selbsttest (AJ-16) fertig. Die P0-Abnahme (AJ-17) ist im automatisierten Teil bestanden ([docs/ABNAHME.md](docs/ABNAHME.md)); offen sind manuelle Prüfungen und der Pilot mit Lernenden ([docs/PILOT.md](docs/PILOT.md)). Start: siehe [docs/ENTWICKLUNG.md](docs/ENTWICKLUNG.md). **Produktname:** Lernjournal, neutrale Marke.

## Installation und Build
- **Für Lernende:** `Lernjournal-Setup-<Version>.exe` ausführen – installiert ohne Adminrechte für den angemeldeten Benutzer (`%LOCALAPPDATA%\Programs\Lernjournal`). Alternativ `Lernjournal-Portable-<Version>.exe` ohne Installation. Daten liegen im selbst gewählten Projektordner; Deinstallieren löscht ihn nie. Windows 10/11, x64.
- **Für Schul-IT und Lehrbetriebe:** [docs/IT-MERKBLATT.md](docs/IT-MERKBLATT.md) (Speicherorte, keine Netzwerkverbindungen, Signaturstatus, Freigabe auf verwalteten Geräten).
- **Build:** `npm ci`, dann `npm run dist:win` (unter Windows) → `dist/`. Code-Signing, Prüfung und Selbsttest des Pakets: [docs/ENTWICKLUNG.md](docs/ENTWICKLUNG.md#paketierung-release-und-code-signing-aj-16). Die Windows-CI baut beide Varianten bei jedem Push und legt sie als Artefakt ab.

## Fixe Entscheidungen
- Electron, React, TypeScript, Tiptap, SQLite (`node:sqlite`), Tailwind CSS, `docx`, electron-builder.
- Windows-Installer und portable EXE; offline-first, ohne Konto, Server oder KI.
- Geführte Journalabschnitte mit frei editierbarem Rich Text.
- Lokaler Projektordner; vollständiger portabler `.ajournal`-ZIP-Export.
- Word als editierbarer **Einweg-Export**, nicht als internes Datenformat.
- UI im vertrauten Stil von Microsoft Office (Ribbon/Toolbar, Datei-Menü, Dokumentfläche), ohne Microsoft-Branding zu kopieren.
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
