# Lernjournal

Offlinefähige Windows-Desktop-App für Lernende Medientechnolog*innen EFZ zum Führen der obligatorischen Lerndokumentation (BiVo Art. 12) und zur Vorbereitung auf das Qualifikationsverfahren. **Ein Arbeitsjournal ist ein eigenständiges Dokument; alle Journale bilden über Kategorien, Tags, Links und Volltextsuche ein persönliches Fachbuch.**

**Status:** Phase 0, Grundgerüst (AJ-01) und Office-ähnliche Oberfläche (AJ-02), Datenbank (AJ-04) und Projekte mit Einrichtungsassistent (AJ-03) Journalverwaltung (AJ-05) und Texteditor (AJ-06) fertig – Bilder folgen mit AJ-07. Start: siehe [docs/ENTWICKLUNG.md](docs/ENTWICKLUNG.md). **Produktname:** Lernjournal, neutrale Marke.

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
6. [docs/adr/](docs/adr/) – Architekturentscheide, [spikes/](spikes/) – Phase-0-Prototypen

MVP vollständig, wenn ein Lernender offline ein Projekt erstellen, Journale schreiben, Bilder einfügen, automatisch speichern, verknüpfen, durchsuchen, als Einzel-/Sammel-DOCX ausgeben und komplett sichern/wiederherstellen kann.
