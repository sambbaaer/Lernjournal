# Lernjournal

Offlinefähige Windows-Desktop-App für Lernende Medientechnolog*innen EFZ. **Ein Arbeitsjournal ist ein eigenständiges Dokument; alle Journale bilden über Kategorien, Tags, Links und Volltextsuche ein persönliches Fachbuch.**

**Status:** Konzept, noch kein Code. **Produktname:** Lernjournal, neutrale Marke.

## Fixe Entscheidungen
- Electron, React, TypeScript, Tiptap, SQLite, Tailwind CSS, `docx`, electron-builder.
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

MVP vollständig, wenn ein Lernender offline ein Projekt erstellen, Journale schreiben, Bilder einfügen, automatisch speichern, verknüpfen, durchsuchen, als Einzel-/Sammel-DOCX ausgeben und komplett sichern/wiederherstellen kann.
