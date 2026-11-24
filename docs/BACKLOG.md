# Lernjournal – umsetzbares Backlog

Stand: 2026-11-24. **P0:** AJ-00–AJ-17. **P1:** AJ-18, AJ-20–AJ-23 (AJ-19 Semesterbesprechung → P2) (erst nach bestandener P0-Abnahme; Reihenfolge: AJ-18 PDF → AJ-20 QV-Mappe → Rest nach Pilot-Feedback). In Reihenfolge der Abhängigkeiten implementieren. Für jedes Ticket: Funktion, Tests, Dokumentation. `R-xx` siehe [QUELLEN.md](QUELLEN.md).

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
| AJ-09 ✔ | Kategorien/Tags | Mehrfachzuordnung im Journal (Kategorien per Auswahlliste, Schlagwörter per Eingabe mit Vorschlägen, sofort gespeichert); Umbenennen, Zusammenführen, Löschen in den Einstellungen; Filter Kategorie/«ohne Kategorie»/Schlagwort in der Journalliste; Vorschlag-Kategorien a–g nachträglich ergänzbar (R-05); Namen eindeutig auch bei Umlauten; Schlagwörter ohne Journal werden automatisch entfernt | 05 | M |
| AJ-10 ✔ | Journal-Verknüpfungen | Verknüpfung in beiden Journalen sichtbar und in beiden lösbar (Rückverweis), nur Verweise statt Kopien; Auswahl per Suche (Titel, Datum, Kategorien, Schlagwörter; ohne Gross/Klein und Umlaute); Link zu Journal im Text (Menüband «Einfügen», Strg+Klick öffnet) mit «Erwähnt in» im Ziel; Löschen eines Journals entfernt Links darauf, der Text bleibt | 05 | S |
| AJ-11 ✔ | Fachbuch und FTS5-Suche | Titel, Text, Bildlegenden, Schlagwörter und Kategorien durchsuchbar – auch Wortteile («messung» → «Farbmessung»), ohne Gross/Klein, Akzente und Umlaut-Schreibweisen (ae/ä, ss/ß), Treffer markiert mit «Gefunden in»; Themenansichten (Kategorien, «Ohne Kategorie», Schlagwörter, verwandte Schlagwörter), Suche im Thema, Archiv wählbar; Index in jeder Änderung nachgeführt, beim Öffnen geprüft, «Suchindex neu aufbauen» in den Einstellungen; Schema v2 mit Migration → [ADR 0004](adr/0004-volltextsuche-fachbuch.md) | 09, 10 | L |

## Phase 4 – Word

| ID | Umsetzung | Abnahme | Abhängig | Grösse |
|---|---|---|---|---|
| AJ-12 ✔ | Einzel-DOCX | Export im Hauptprozess mit `docx` 9.16: Formatvorlagen (Überschrift 1–4, Beschriftung, Journal-Metadaten), Kopfblock (Name, Lehrbetrieb, Datum, Lehrjahr/Semester, Lernort, Kategorien, Schlagwörter), Word-Listen (jede neu ab 1, Startwert, Folgeabsätze), Tabellen mit wiederholter Kopfzeile, Bilder auf Satzspiegel mit Legende «Abbildung n» (SEQ-Feld), WebP → PNG, Fusszeile «Seite X von Y»; Exporthinweis (R-10) vor jedem Export, nativer Speichern-Dialog ohne stilles Überschreiben, atomares Schreiben, «Im Ordner anzeigen»; aufrufbar aus Menüband, Journalliste, Ansicht «Export» und Datei-Menü; Golden Files (document/styles/numbering/footer/rels), LibreOffice-Gegenprobe, E2E → [ADR 0002](adr/0002-docx-export.md) | 00b, 07 | L (Sichtprüfung in Word 365 offen) |
| AJ-13 ✔ | Sammel-DOCX | Ansicht «Export»: Auswahl per Kontrollkästchen mit Suche, Zeitraum (Arbeitsdatum von/bis) und Archiv; Reihenfolge standardmässig chronologisch, mit Auf/Ab bzw. Alt+Pfeil änderbar (Fokus wandert mit, Ansage), «Chronologisch sortieren»; Auswahl bleibt beim Ansichtswechsel erhalten. Dokument: Titelseite (Titel frei, Name, Lehrbetrieb, Beruf/Fachrichtung, Zeitraum, Anzahl, Erstelldatum; ohne Fusszeile), TOC-Feld über die Journaltitel (vorbefüllt, Word ergänzt Seitenzahlen beim Öffnen; Hinweis «Felder aktualisieren» im Dialog), «Seitenumbruch oberhalb» je Journal, durchlaufende Abbildungsnummern, Links zwischen enthaltenen Journalen als Sprung; Hinweise mit Journaltitel. IPC `export:collectionDocx` prüft 1–500 IDs ohne Doppelte, Titel ≤ 150 Zeichen, Hinweis R-10; Zielpfad nur aus dem Speichern-Dialog; Golden Files, Dienst mit echter DB, LibreOffice-Gegenprobe, Auswahl-Logik, E2E → [ADR 0002](adr/0002-docx-export.md) | 12 | M (Sichtprüfung in Word 365 offen) |

## Phase 5 – Stabilisierung

| ID | Umsetzung | Abnahme | Abhängig | Grösse |
|---|---|---|---|---|
| AJ-14 ✔ | .ajournal Import/Export | ZIP mit `journal.sqlite` (Backup-API, VACUUM, ohne WAL), Bildern und `manifest.json` (Formatversion, App-/Schemaversion, Erstellzeit, Grösse + SHA-256 je Datei), nach dem Schreiben vollständig geprüft, atomar; Import nur in neuen/leeren Ordner (Vorschlag Dokumente\Titel) mit Vorschau, Prüfung aller Hashes, Bilder nach Bytes, Datenbank (Version, exaktes Schema, integrity_check, Inhalte nach Editor-Schema), Migration älterer Schemas, Suchindex neu, Aufräumen bei Fehler; neuere Formate abgelehnt; eigener ZIP-Leser auf `node:zlib` ohne neue Abhängigkeit; Grenzen zentral (`ARCHIVE_LIMITS`), beim Entpacken nachgezählt; Angriffstests (ZIP-Slip inkl. Laufwerk/Backslash/Symlink, Zip-Bombe mit gelogenen Grössen und Überlappung, falsche/fehlende Hashes, ungelistete/doppelte Einträge, kaputtes ZIP, manipulierte DB); Datei-Menü «Importieren»/«Exportieren → Projekt übergeben», Menüband, Startbildschirm, Fortschritt; E2E «zweiter Computer» → [ADR 0005](adr/0005-ajournal-paketformat.md) | 07 | M |
| AJ-15 ✔ | Backup/Restore | ZIP je Stand im Ordner `backups` (Backup-API aus eigener Leseverbindung in einem Schritt – auch während gespeichert wird, gilt ebenso für `.ajournal`; Suchindex geleert; Manifest mit Prüfsummen, Fingerabdruck, neuesten Titeln), Bilder einmal im Vorrat `backups/media`; automatisch beim Öffnen (Inhalt geändert, auch nach Absturz), Schliessen/Beenden und täglich nach Änderungen, «Jetzt sichern»; keine Duplikate bei unverändertem Inhalt; Sicherung vor Migration als «vor-update» vereinheitlicht; Rotation letzte 10 + je Monat (Schutz bei verstellter Uhr, Bildvorrat aufgeräumt); Wiederherstellung mit vollständiger Prüfung und Vorschau als neues Lernjournal oder durch Ersetzen mit Sicherheitskopie vorher, Prüfungen wie Import, Suchindex neu; beschädigte Sicherungen erkannt; Erinnerung «Projekt übergeben» nach 30 Tagen mit «Später erinnern», Schema v3; Tests: Konsistenz unter Schreiblast, WAL, Rotation, Roundtrip mit Bildern/Links/Tags/Suche, beide Wiederherstellungsarten, Manipulation, altes Schema, Zeitpunkte, Erinnerungs-Grenzfälle, IPC, E2E → [ADR 0006](adr/0006-sicherungen.md) | 04, 14 | M |
| AJ-16 ✔ | electron-builder Windows | Konfiguration `electron-builder.ts`: NSIS mit einem Klick pro Benutzer (`%LOCALAPPDATA%\Programs`, nur HKCU, kein Elevate-Helfer, Deutsch, Verknüpfungen, Deinstallation lässt Projektordner und App-Daten), portable EXE (`%TEMP%\Lernjournal-Portable`), x64, kein Auto-Update, keine Dateizuordnung, eigenes Symbol (SVG → ICO/PNG), `app.asar` 28,5 → 13,7 MB; Code-Signing über Umgebungsvariablen (Zertifikat oder Azure Trusted Signing, Release erzwingt Signatur), unsigniert ohne Fehler; Selbsttest im gepackten Programm über die echte Brücke (Projekt, Journal mit Bild, Suche, Word, `.ajournal`, Neustart, Import) mit Chromium-Netzwerkprotokoll ohne jede Verbindung – fand und unterbindet den Wörterbuch-Download der Rechtschreibprüfung; Fuse-Angriff (RunAsNode, NODE_OPTIONS, --inspect) wirkungslos; Paketprüfung (Fuses, asar-Inhalt ohne Quellen/Tests/Dev-Pakete, Manifest `asInvoker`, SHA-256); Windows-CI-Job `paket`: bauen, prüfen, Firewall-Sperre, Selbsttest entpackt/installiert/portabel, stille Installation und Deinstallation; [IT-MERKBLATT.md](IT-MERKBLATT.md) → [ADR 0007](adr/0007-paketierung-und-signing.md) | 01 | M (offen: Zertifikat; Test mit Standardbenutzer auf sauberem bzw. verwaltetem Windows 10/11 → AJ-17; Rechtschreibprüfung unter Windows von Hand prüfen) |
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
