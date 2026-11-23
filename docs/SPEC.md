# Lernjournal – MVP-Spezifikation v1.0

Stand: 2026-11-23. **MUSS=P0, SOLL=P1, SPÄTER=P2.**

## Ziel und Scope
Einzelplatz-Windows-App für Lerndokumentation über mehrere Lehrjahre. Journal = unabhängiges, nach Word exportierbares Dokument. Fachbuch = dynamische Sicht auf dieselben Journale mit Kategorien, Tags, Links und Suche. Keine inhaltliche Doppelerfassung. Offline, keine Registrierung oder externe Verarbeitung. Abgeschlossene Journale sind nicht automatisch vom Lehrbetrieb freigegeben; kein offizielles Bewertungssystem.

**P0:** Journal erstellen/bearbeiten/duplizieren/archivieren/löschen; strukturierter Editor mit Bildern; Entwurf/Abgeschlossen; Themen, Tags, Links, Volltextsuche; Word-Einzel-/Sammelexport; Autosave, Projektimport/-export, Backup/Restore; Windows-Installer + portable EXE.
**P1:** weitere Vorlagen, Qualitätshinweise, Handlungskompetenzen aus Bildungsplan, konfigurierbare Word-Layouts.
**P2:** Berufsbildner-Feedback, KI-Reflexion, Cloud-Sync, eigenständige Wissensseiten, frei importierbare DOCX-Templates.

## Navigation
1. **Start:** zuletzt bearbeitet, Entwürfe, abgeschlossene Journale, neues Journal.
2. **Journale:** Liste, Sortierung, Filter, Status, Bearbeiten und Organisation.
3. **Fachbuch:** Themen, Schlagwörter, Volltext und verwandte Journale.
4. **Export:** Einzel- und Sammel-DOCX mit Reihenfolge.
5. **Einstellungen:** Profil, Speicherort, Word-Design, Backups und Wiederherstellung.

## Journal
Minimale Metadaten: UUID, Titel, Arbeitsdatum, Status, Erstell-/Änderungszeit. Profil: Name, optional Lehrbetrieb, Lehrbeginn. Lehrjahr aus Lehrbeginn/Datum ableiten, manuell korrigierbar. Mehrere Kategorien und Tags sowie Journal-Links möglich. Geführte, aber frei editierbare Abschnitte:
- **Auftrag/Ausgangslage:** Was war die Aufgabe, was das Ziel?
- **Durchführung:** Wie und weshalb wurde gearbeitet? Text, nummerierte Schritte, Tabellen, Bilder mit Legenden.
- **Reflexion:** Erkenntnisse, Schwierigkeiten, nächste Verbesserungen.
Hilfetexte statt Pflichtformularen. Status `draft|completed|archived`; `completed` ist Selbstauskunft, keine amtliche Freigabe. Automatisch Speichern, sichtbarer Status und Fehlermeldung.

## UI/UX – vertraut wie Microsoft Office
Office als **Interaktionsvorbild**, nicht als Markenkopie. Desktop-Titelleiste, Datei-Menü, Ribbon-/Register-ähnliche **kompakte** Werkzeugleiste, linke Navigation, zentrale helle Dokumentfläche, untere Statusleiste. Editor-Register: **Start** (Text/Absatz), **Einfügen** (Bilder/Tabellen/Links), **Journal** (Metadaten/Beziehungen), **Exportieren**. Vertraute Office-Symbole/-Begriffe, kontextuelle Befehle; keine riesige leere Ribbon-Fläche. Ruhige Typografie, sichtbare Seitenstruktur, klare visuelle Hierarchie. Native Windows-Dateidialoge. Tastatur: Ctrl+S, Ctrl+N, Ctrl+F, Ctrl+B/I, Ctrl+Z/Y. Sichtbarer Tastaturfokus, Tooltips, kontrastreiche Zustände, grössere Klickziele, brauchbare Skalierung 100–200 %, Fenster ab ca. 1024px. Texte in Schweizer Hochdeutsch («…», ss). Status «Speichert…», «Gespeichert», «Speichern fehlgeschlagen» nur bei zutreffendem Zustand.

## Architektur
- **Electron Main:** Fenster, Dateioperationen, SQLite, Export, Backups.
- **Preload:** minimale, typisierte und validierte IPC-Schnittstelle.
- **Renderer:** React, TypeScript, Tailwind, Tiptap; kein direkter Zugriff auf Node/DB/Dateisystem.
- **Persistenz:** SQLite mit Migrationen, Foreign Keys und Transaktionen; Rich-Text-Abschnitte als Tiptap-JSON, Bilder separat im Projektordner über UUID/relative Pfade referenziert.
- **Suche:** SQLite FTS5 mit extrahierter Klartextprojektion (Titel + Textabschnitte); Index rekonstruierbar.
- **Zeit:** Arbeitsdatum als lokales ISO-Datum; Zeitstempel UTC.

Logisches Schema:
```
project(id,schema_version,title,created_at)
profile(id,display_name,company,apprenticeship_start)
journal(id,title,work_date,status,sections_json,created_at,updated_at,completed_at?)
category(id,name), journal_category(journal_id,category_id)
tag(id,name), journal_tag(journal_id,tag_id)
journal_link(source_journal_id,target_journal_id)
media(id,journal_id,relative_path,original_name,mime_type,caption,created_at)
journal_fts(derived_search_index)
```
Integrität: keine doppelten Beziehungen oder Selbstlinks, referenzielle Integrität, Links in beide Richtungen anzeigen, Bilder nicht verwaisen lassen. Fachbuch speichert keine Kopien.

Projektordner:
```
Lernjournal-Projekt/
  journal.sqlite
  media/<uuid>.<ext>
  backups/
  exports/
```
Portable `.ajournal`: versioniertes ZIP mit `manifest.json` (Formatversion, Exportdatum, Prüfsummen), konsistenter DB-Sicherung und allen Medien. ZIP-Slip, Pfad-Traversal, Grössenlimiten und erlaubte Dateitypen beim Import prüfen; nie unbemerkt überschreiben. Mehrfaches gleichzeitiges Öffnen eines Projekts durch Lock verhindern; bei Cloud-synchronisierten Ordnern Konfliktrisiko anzeigen.

## Autosave, Backup und Sicherheit
Autosave nach kurzer Ruhephase; ausstehende Änderungen bei Navigation/Schliessen flushen; nur bestätigte DB-Transaktionen als gespeichert darstellen. Mindestens täglich nach Änderungen und bei Programmende konsistentes DB-Backup via SQLite-Backup-API, Rotation z.B. letzte 10. Medien konsistent berücksichtigen. Restore mit Vorschau/Bestätigung, vorzugsweise neues Zielprojekt. Externe Kopien empfehlen: lokale Backups schützen nicht vor Hardwareverlust.
Electron: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, CSP, kein Remote-Content, minimale `contextBridge`, validierte IPC-Nachrichten/Dateipfade, keine beliebigen Shell-Aufrufe. Bildformate JPEG/PNG/WebP, Grössenlimiten, sichere Dateinamen. Keine Telemetrie oder Uploads im MVP. Hinweise zu personenbezogenen Bildern und Betriebsinformationen.

## Word-Export
`docx` erzeugt echte Word-Absätze, Überschriften, Listen, Tabellen, Bilder und Bildlegenden statt HTML-Pseudoexport. Metadaten und optional Kopf-/Fusszeilen mit Seitenzahlen. Sammel-DOCX mit ausgewählter Reihenfolge, Titelseite, klaren Journal-Grenzen und aktualisierbarem Inhaltsverzeichnis-Feld (ggf. Aktualisierung in Word erforderlich). Einfache konfigurierbare Standardgestaltung; beliebiger Word-Template-Import nicht P0. Export mit sicherem Dateidialog, ohne stilles Überschreiben. Änderungen in Word gehen **nicht** zurück in die App. Kein Word als Laufzeitvoraussetzung; PDF optional später.

## P0-Abnahme
1. Projekt offline anlegen und nach Neustart öffnen.
2. Journal mit drei Abschnitten, mehreren Bildern/Legenden und Metadaten dauerhaft speichern.
3. Status, Duplizieren, Archivieren, Löschen funktionieren sicher.
4. Mehrfachkategorien/Tags/Links ohne Inhaltsduplikation.
5. Volltextsuche findet Titel und Rich-Text-Begriffe.
6. Einzel-DOCX in Word bearbeitbar: echte Formate, Bilder/Legenden.
7. Drei Journale in einer DOCX zusammenfassen, Reihenfolge und TOC vorhanden.
8. Projekt-ZIP auf zweitem Windows-PC vollständig importierbar.
9. Bestätigte Speicherung übersteht erzwungenen Abbruch; Backup wiederherstellbar.
10. Komplett offline; Installer und portable Build auf sauberem Windows getestet.
11. UI Office-vertraut, Tastaturbedienung und hohe DPI getestet.

## Implementierungshinweise
Versionen und Lizenzbedingungen aktueller Bibliotheken bei Start prüfen. SQLite-Adapter zuerst mit Electron-Packaging/Native-ABI, WAL und konsistentem Backup testen. DOCX-Export früh mit Tiptap-JSON, Bildern und Inhaltsverzeichnis prototypisieren. Keine Features aus P1/P2 in den MVP ziehen.
