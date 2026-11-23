# Lernjournal – umsetzbares Backlog

Stand: 2026-11-23. **P0:** AJ-00–AJ-17. **P1:** AJ-18–AJ-23 (erst nach bestandener P0-Abnahme). In Reihenfolge der Abhängigkeiten implementieren. Für jedes Ticket: Funktion, Tests, Dokumentation. `R-xx` siehe [QUELLEN.md](QUELLEN.md).

Grösse: S ≈ 1 Tag, M ≈ 2–4 Tage, L ≈ 1–2 Wochen (grobe Schätzung für eine Person mit KI-Unterstützung).

## Phase 0 – Spikes (Risiken zuerst klären)

| ID | Umsetzung | Abnahme | Grösse |
|---|---|---|---|
| AJ-00a | Spike SQLite in Electron | Adapter gewählt (z. B. better-sqlite3 oder node:sqlite), WAL, FTS5, Backup-API funktionieren im **gepackten** Build auf Windows; ADR geschrieben | M |
| AJ-00b | Spike DOCX | Tiptap-JSON mit Liste, Tabelle, Bild + Legende und TOC-Feld → DOCX öffnet fehlerfrei in Word und LibreOffice; ADR | M |
| AJ-00c | Quellen gegenlesen | BiVo Art. 12 und QV-Ausführungsbestimmungen im Original geprüft, QUELLEN.md-Status auf ✔ bzw. offene Fragen aktualisiert | S |

## Phase 1 – Fundament

| ID | Umsetzung | Abnahme | Abhängig | Grösse |
|---|---|---|---|---|
| AJ-01 | Electron/Vite/React/TS/Tailwind Setup, Lint, Vitest, CI auf `windows-latest` | Devstart auf Windows; sichere Preload-Bridge; Fuses gesetzt; CI grün | 00a | M |
| AJ-02 | Office-nahe App-Shell | Datei-Menü, Ribbon-Tabs, Navigation, Dokumentfläche, Statusleiste, Tastatur inkl. F6; Kontrast AA | 01 | M |
| AJ-03 | Projektanlage/Öffnen/Profil, Onboarding | Frei wählbarer lokaler Ordner; Profil mit Name, Fachrichtung (R-04), Lehrbeginn; OneDrive-Warnung | 02, 04 | M |
| AJ-04 | SQLite-Schema/Migrationen/Lock | DB und P0-Tabellen aus SPEC; Integritätstests; verwaister Lock erkannt | 00a | M |

## Phase 2 – Editor

| ID | Umsetzung | Abnahme | Abhängig | Grösse |
|---|---|---|---|---|
| AJ-05 | Journal-CRUD, Status, Lernort | erstellen, öffnen, duplizieren, archivieren, löschen; Lernort (R-03); Lehrjahr/Semester abgeleitet + überschreibbar (Unit-Tests mit Grenzfällen) | 04 | M |
| AJ-06 | Geführter Tiptap-Editor | Auftrag/Durchführung/Reflexion mit Hilfetext-Platzhaltern; Knoten-Whitelist; Paste-Bereinigung aus Word | 05 | L |
| AJ-07 | Medien/Legenden | Bilder einfügen (Drag & Drop, Zwischenablage, Dialog), verkleinern, EXIF-Ort entfernen, lokal speichern und erneut laden; keine verwaisten Dateien | 06 | M |
| AJ-08 | Autosave und Fehlerzustände | korrekter Speicherstatus, Flush, Absturztest mit `integrity_check` | 06 | M |

## Phase 3 – Fachbuch

| ID | Umsetzung | Abnahme | Abhängig | Grösse |
|---|---|---|---|---|
| AJ-09 | Kategorien/Tags | Mehrfachzuordnung, Umbenennen, Zusammenführen, Filter; Vorschlag-Kategorien a–g aus Bildungsplan (R-05) | 05 | M |
| AJ-10 | Journal-Verknüpfungen | Rückverweise sichtbar, keine Kopien, Link-Auswahl per Suche | 05 | S |
| AJ-11 | Fachbuch und FTS5-Suche | Titel, Text, Legenden, Tags durchsuchbar (diakritikunabhängig); Themenansichten; Index neu aufbauen | 09, 10 | L |

## Phase 4 – Word

| ID | Umsetzung | Abnahme | Abhängig | Grösse |
|---|---|---|---|---|
| AJ-12 | Einzel-DOCX | In Word editierbar, Formatvorlagen, Listen/Bilder/Legenden/Seitenzahlen; Exporthinweis (R-10); Golden-File-Test | 00b, 07 | L |
| AJ-13 | Sammel-DOCX | Auswahl, Reihenfolge, Titelseite, TOC-Feld, Seitenumbruch je Journal | 12 | M |

## Phase 5 – Stabilisierung

| ID | Umsetzung | Abnahme | Abhängig | Grösse |
|---|---|---|---|---|
| AJ-14 | .ajournal Import/Export | versioniertes ZIP mit Prüfsummen; Import in neues Projekt; Angriffstests (ZIP-Slip, Zip-Bombe, falsche Hashes) | 07 | M |
| AJ-15 | Backup/Restore | konsistent, Rotation, Wiederherstellung mit Vorschau; Export-Erinnerung nach 30 Tagen | 04, 14 | M |
| AJ-16 | electron-builder Windows | Installer ohne Adminrechte + portable EXE; Code-Signing vorbereitet; IT-Merkblatt; Offline-Test | 01 | M |
| AJ-17 | Ende-zu-Ende-Abnahme | alle 11 P0-Tests aus SPEC bestanden, Pilot mit 3–5 Lernenden | alle | M |

## P1 – nach MVP (Reihenfolge nach Pilot-Feedback)

| ID | Umsetzung | Abnahme | Grundlage |
|---|---|---|---|
| AJ-18 | PDF-Export | Einzel- und Sammel-PDF offline via `printToPDF`; Layout entspricht DOCX sinngemäss | R-08 |
| AJ-19 | Semesterbesprechung | Zeitraum wählen, Visumsblatt DOCX/PDF, «besprochen am» erfassen, Snapshot + Änderungsanzeige | R-06, R-07 |
| AJ-20 | QV-Mappe | Auswahl + Reihenfolge, Zähler mit konfigurierbarer Empfehlung (Standard 12), Titelseite, TOC, DOCX + PDF | R-08 |
| AJ-21 | Kompetenzkatalog | versionierter Katalog 34200 offline, Zuordnung Journal ↔ Handlungskompetenz/Leistungsziel, Filter nach Fachrichtung und Lernort | R-09 |
| AJ-22 | Abdeckungsübersicht | Matrix Bereiche a–g × Lehrjahr, Hinweis «Orientierung, keine amtliche Zuordnung» | R-09 |
| AJ-23 | Qualitätshinweise und Vorlagen | nicht blockierende Hinweise (leere Reflexion, Bild ohne Legende); 2–3 Vorlagen (z. B. Maschine einrichten, Kundenauftrag, Störung beheben) | Bildungsplan |

**Definition of Done:** offline ohne Anmeldung; sichere IPC; persistente Daten; Tests für Fehler und Normalfall; UI Schweizer Hochdeutsch, Office-vertraut, zugänglich (WCAG 2.2 AA sinngemäss); Dokumentation (SPEC/README/ADR) nachgeführt; keine vorgezogenen Funktionen aus späteren Prioritäten.
