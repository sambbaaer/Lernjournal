# Lernjournal – umsetzbares Backlog

Stand: 2026-11-23. **P0:** AJ-00–AJ-17. **P1:** AJ-18, AJ-20–AJ-23 (AJ-19 Semesterbesprechung → P2) (erst nach bestandener P0-Abnahme; Reihenfolge: AJ-18 PDF → AJ-20 QV-Mappe → Rest nach Pilot-Feedback). In Reihenfolge der Abhängigkeiten implementieren. Für jedes Ticket: Funktion, Tests, Dokumentation. `R-xx` siehe [QUELLEN.md](QUELLEN.md).

Grösse: S ≈ 1 Tag, M ≈ 2–4 Tage, L ≈ 1–2 Wochen (grobe Schätzung für eine Person mit KI-Unterstützung).

## Phase 0 – Spikes ✔ abgeschlossen (2026-11-23)

| ID | Umsetzung | Ergebnis | Status |
|---|---|---|---|
| AJ-00a | Spike SQLite in Electron | `node:sqlite` (Electron 45.4.1 / Node 24.22 / SQLite 3.54.1): WAL, FTS5, Online-Backup, Absturztest bestanden – auch als gepackte Windows-EXE mit Fuses in CI → [ADR 0001](adr/0001-sqlite-adapter-node-sqlite.md) | ✔ |
| AJ-00b | Spike DOCX | Tiptap-JSON → DOCX mit Listen, Tabelle, Bild + nummerierter Legende, TOC, internen Links, Seitenzahlen; 9 Tests, LibreOffice-Gegenprobe → [ADR 0002](adr/0002-docx-export.md) | ✔ (Sichtprüfung in Word 365 offen) |
| AJ-00c | Quellen gegenlesen | BiVo (Stand 1.1.2026), Ausführungsbestimmungen 2021, Leitfäden dpsuisse 2025 im Original gelesen → QUELLEN.md, neue Anforderungen R-15/R-16 | ✔ |

## Phase 1 – Fundament

| ID | Umsetzung | Abnahme | Abhängig | Grösse |
|---|---|---|---|---|
| AJ-01 ✔ | Electron/Vite/React/TS/Tailwind Setup, Lint, Vitest, CI auf `windows-latest` | Devstart auf Windows; sichere Preload-Bridge; Fuses gesetzt; CI grün → [ADR 0003](adr/0003-toolchain-und-sicherheitsrahmen.md), [ENTWICKLUNG.md](ENTWICKLUNG.md) | 00a | M |
| AJ-02 ✔ | Office-nahe App-Shell | Datei-Menü (Alt+D, Esc), vereinfachtes Menüband mit 4 Registern, Navigation, Dokumentfläche, Statusleiste; Tastatur inkl. F6, Pfeiltasten, Strg+Umschalt+F; axe-Prüfung WCAG 2.2 AA ohne Verstösse; 1024 × 640 und 150 % Zoom | 01 | M |
| AJ-03 ✔ | Projektanlage/Öffnen/Profil, Onboarding | Startbildschirm, Assistent in 3 Schritten (Vorschlag Dokumente\Lernjournal, Profil mit Fachrichtung Print als Standard, Kategorien a–g), Zuletzt-Liste, automatisches Öffnen beim Start, Rückfrage bei Sperre auf anderem PC, Cloud-Warnung, Pfad-Freigabeliste, Profil in Einstellungen | 02, 04 | M |
| AJ-04 ✔ | SQLite-Schema/Migrationen/Lock | Schema v1 mit Constraints (Status, Lernort, Datum, JSON, Pfade, keine Doppel-/Selbstlinks), Migrationen mit Backup vorher und Rollback, Schutz vor neueren Dateiformaten, Integritätsprüfung; Projektsperre mit Erkennung verwaister Sperren und Fremd-PC-Rückfrage | 00a | M |

## Phase 2 – Editor

| ID | Umsetzung | Abnahme | Abhängig | Grösse |
|---|---|---|---|---|
| AJ-05 ✔ | Journal-CRUD, Status, Lernort | Anlegen (Strg+N), öffnen, Metadaten mit automatischem Speichern, Status Entwurf/Abgeschlossen/Archiviert, duplizieren (mit Kategorien/Schlagwörtern, ohne Links), löschen mit Bestätigung inkl. Bilddateien; Lehrjahr/Semester aus Lehrbeginn (13 Grenzfall-Tests), manuell überschreibbar; Journalliste mit Filter und Tastatur | 04 | M |
| AJ-06 ✔ | Geführter Tiptap-Editor | Ein Editor je Abschnitt mit Hilfetext-Platzhaltern; Menüband (Fett/Kursiv/Unterstrichen, Listen, Überschrift 2/3, Rückgängig) mit Zustandsanzeige; Tabellen mit kontextuellem Register; Weblinks (nur http/https); Einfügen aus Word bereinigt; gemeinsames Schema prüft Inhalte auch im Hauptprozess; Autosave 800 ms / max. 10 s, Strg+S | 05 | L |
| AJ-07 ✔ | Medien/Legenden | Bilder per Dialog, Drag & Drop und Strg+V; EXIF-Ausrichtung übernommen, auf 2400 px verkleinert, neu kodiert (alle Metadaten inkl. GPS entfernt); Hauptprozess prüft Format/Masse aus den Bytes, speichert atomar mit SHA-256; Legende im Bild (Alt-Text), durchsuchbar; Duplikat kopiert Bilder; verwaiste Bilder werden beim Öffnen aufgeräumt | 06 | M |
| AJ-08 ✔ | Autosave und Fehlerzustände | Fenster schliessen speichert Ausstehendes (Close-Guard mit Rückfrage bei Fehler, Frist bei hängender Oberfläche); Speicherfehler mit automatischem Wiederholversuch (2/5/10/30 s) und «Erneut versuchen»; Projektwechsel speichert zuerst; Absturztests: SIGKILL des Schreibprozesses (integrity_check, keine bestätigte Transaktion verloren) und der ganzen App | 06 | M |

## Phase 3 – Fachbuch

| ID | Umsetzung | Abnahme | Abhängig | Grösse |
|---|---|---|---|---|
| AJ-09 ✔ | Kategorien/Tags | Mehrfachzuordnung im Journal (Kategorien als Auswahlliste, Schlagwörter mit Vorschlägen), Umbenennen mit Kollisionsprüfung, Zusammenführen ohne Doppelzuordnung, Löschen ohne Journalverlust; nicht verwendete Schlagwörter verschwinden; Filter in der Journalliste; Schlagwörter im Suchindex; Vorschlag a–g (R-05) | 05 | M |
| AJ-10 ✔ | Journal-Verknüpfungen | Beziehung einmal gespeichert, in beiden Journalen sichtbar (Rückverweis), keine Kopien; Auswahl per Suche (Combobox, FTS-Präfix, entschärfte Eingabe); «Link zu Journal» im Text verknüpft zusätzlich; Strg+Klick öffnet Journal bzw. Webseite nach Rückfrage (nur http/https) | 05 | S |
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
| AJ-17 | Ende-zu-Ende-Abnahme | alle 11 P0-Tests aus SPEC bestanden, Pilot mit 3–5 Lernenden der Fachrichtung Print (Fokus: Wird das Journalführen einfacher?) | alle | M |

## P1 – nach MVP

| ID | Umsetzung | Abnahme | Grundlage |
|---|---|---|---|
| AJ-18 | PDF-Export (zuerst) | Einzel- und Sammel-PDF offline via `printToPDF`; Schriften eingebettet, Text durchsuchbar, Bilder moderat komprimiert, Dateigrösse angezeigt; Layout entspricht DOCX sinngemäss | R-08 |
| AJ-20 | QV-Mappe | Auswahl + Reihenfolge, Filter für IPA-Bezug, Zähler «x von mindestens 12» (alle Fachrichtungen, konfigurierbar), Hinweis «mit der Aufgabenstellung einreichen», Titelseite, TOC; **PDF für PkOrg**, DOCX optional | R-08, R-15 |
| AJ-21 | Kompetenzkatalog | versionierter Katalog 34200 offline inkl. Wortlaut, freiwillige Zuordnung Journal ↔ Handlungskompetenz/Leistungsziel, Standardfilter Print + Betrieb | R-09 |
| AJ-22 | Abdeckungsübersicht | Matrix Bereiche a–g × Lehrjahr, Hinweis «Orientierung, keine amtliche Zuordnung» | R-09 |
| AJ-23 | Qualitätshinweise und Vorlagen | nicht blockierende Hinweise (leere Reflexion, Bild ohne Legende); 2–3 Vorlagen (z. B. Maschine einrichten, Kundenauftrag, Störung beheben) | Bildungsplan |

**Definition of Done:** besteht das Leitprinzip «Einfachheit vor Vollständigkeit» (SPEC); offline ohne Anmeldung; sichere IPC; persistente Daten; Tests für Fehler und Normalfall; UI Schweizer Hochdeutsch, Office-vertraut, zugänglich (WCAG 2.2 AA sinngemäss); Dokumentation (SPEC/README/ADR) nachgeführt; keine vorgezogenen Funktionen aus späteren Prioritäten.
