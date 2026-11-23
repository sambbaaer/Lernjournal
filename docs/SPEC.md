# Lernjournal – MVP-Spezifikation v1.5

Stand: 2026-11-23 (v1.0 → v1.1: Abgleich mit offiziellen Vorgaben, siehe [QUELLEN.md](QUELLEN.md); v1.2: geklärte Fragen eingearbeitet – Fokus Print, PDF für PkOrg, inoffizielles Hilfsmittel; v1.3: Semesterbesprechung nach P2, Katalog nur Bildungsplan 2018; v1.4: Phase 0 abgeschlossen – Original-Quellen gegengelesen, ADR 0001/0002; v1.5: Suche mit Trigramm-Tokenizer für Wortteile, ADR 0004). **MUSS=P0, SOLL=P1, SPÄTER=P2.** Verweise `R-xx` zeigen auf abgeleitete Anforderungen in QUELLEN.md.

## Ziel und Scope
Einzelplatz-Windows-App für Lerndokumentation über die vier Lehrjahre. Journal = unabhängiges, nach Word exportierbares Dokument und entspricht einer **Lerndokumentation nach BiVo Art. 12** (R-01). Fachbuch = dynamische Sicht auf dieselben Journale mit Kategorien, Tags, Links und Suche. Keine inhaltliche Doppelerfassung. Offline, keine Registrierung oder externe Verarbeitung. Abgeschlossene Journale sind nicht automatisch vom Lehrbetrieb freigegeben; kein offizielles Bewertungssystem (R-02). Lernjournal ist ein **inoffizielles Hilfsmittel** (R-14). **Fachlicher Fokus: Fachrichtung Print**; Printmediatechnik und Siebdruck werden unterstützt, aber nicht priorisiert.

### Leitprinzip: Einfachheit vor Vollständigkeit
Die App soll Lernenden das Führen des Journals **erleichtern**, nicht zusätzliche Pflichten schaffen. Darum: sinnvolle Standardwerte (Fachrichtung Print, Lernort Betrieb, Arbeitsdatum heute), alle Zuordnungen (Kategorien, Tags, Kompetenzen) freiwillig, kein Feld blockiert das Speichern, ein neues Journal ist mit einem Klick und einem Titel angelegt. Jede neue Funktion muss diesen Grundsatz bestehen.

### Warum die App (offizieller Nutzen)
1. **Pflicht erfüllen:** Lerndokumentation laufend führen, mind. einmal pro Semester mit der Berufsbildnerin/dem Berufsbildner besprechen und unterzeichnen lassen.
2. **QV vorbereiten:** Für die IPA werden **mindestens 12 Lernberichte** zusammen mit der Aufgabenstellung, also **vor** der IPA, als **PDF in PkOrg** eingereicht. Sie sollen einen Bezug zur IPA haben und sind Grundlage für das Fachgespräch. Während der IPA darf die Lerndokumentation als Hilfsmittel verwendet werden (BiVo Art. 18; QUELLEN 2.3).
3. **Fachbuch:** Über vier Jahre entsteht ein persönliches, durchsuchbares Nachschlagewerk.

### Zielgruppen
- **Lernende** (primär, 15–20 J.): schreiben, ordnen, exportieren. Oft wenig Erfahrung mit Dateiablage → einfache, verzeihende Bedienung.
- **Berufsbildende** (sekundär, ohne eigenen Zugang): erhalten DOCX/PDF zur Besprechung.
- **Lehrpersonen/üK-Leitende** (tertiär): sehen Exporte; keine Klassenverwaltung.

### Prioritäten
**P0:** Journal erstellen/bearbeiten/duplizieren/archivieren/löschen; strukturierter Editor mit Bildern; Entwurf/Abgeschlossen; Lernort (R-03); Fachrichtung im Profil (R-04); Vorschlag-Kategorien a–g (R-05); Themen, Tags, Links, Volltextsuche; Word-Einzel-/Sammelexport mit Exporthinweis (R-10); Autosave, Projektimport/-export, Backup/Restore; Windows-Installer + portable EXE.
**P1:** PDF-Export (erstes P1-Ticket, Voraussetzung für die QV-Mappe); QV-Mappe als PDF für PkOrg (R-08); Kompetenzkatalog und Abdeckungsübersicht (R-09); weitere Vorlagen; Qualitätshinweise; konfigurierbare Word-Layouts.
**P2:** Semesterbesprechung mit Visumsblatt und Snapshot (R-06, R-07), Berufsbildner-Feedback in der App, KI-Reflexion, Cloud-Sync, eigenständige Wissensseiten, frei importierbare DOCX-Templates, weitere Berufe (z. B. Polygraf EFZ) über Katalog, macOS-Build.

### Nicht-Ziele
Bildungsbericht (R-12), Notenberechnung, Prüfungsbewertung, Klassen- und Benutzerverwaltung, Mehrbenutzerbetrieb, Synchronisation mit Word-Dateien, digitale Signaturen mit Rechtswirkung.

## Begriffe
| App-Begriff | Bedeutung | Offizieller Bezug |
|---|---|---|
| Journal | ein Eintrag mit Auftrag/Durchführung/Reflexion | «Lernbericht» als Teil der «Lerndokumentation» (BiVo Art. 12, Leitfaden dpsuisse) |
| – | nicht Teil der App | «Arbeitsjournal» der IPA (tägliches Vorgehen während der Prüfung) |
| Fachbuch | Sicht über alle Journale | Nachschlagewerk (SDBB) |
| Kategorie | Ordnungsbegriff, Vorschlag = Handlungskompetenzbereich a–g | Bildungsplan |
| QV-Mappe | Auswahl für die IPA-Einreichung | Ausführungsbestimmungen QV |

## Navigation
1. **Start:** zuletzt bearbeitet, Entwürfe, abgeschlossene Journale, neues Journal.
2. **Journale:** Liste, Sortierung, Filter (Status, Lehrjahr, Semester, Lernort, Kategorie, Tag), Bearbeiten und Organisation.
3. **Fachbuch:** Themen (Kategorien, «Ohne Kategorie»), Schlagwörter, Volltext und verwandte Schlagwörter; Suche lässt sich auf ein Thema einschränken, Archiv wählbar. Verwandte Journale zeigt das Journal selbst («Verknüpft mit», «Erwähnt in»).
4. **Export:** Einzel- und Sammel-DOCX mit Reihenfolge; P1: PDF und QV-Mappe.
5. **Einstellungen:** Profil, Speicherort, Word-Design, Backups und Wiederherstellung, Datenschutzhinweis.

## Journal
Minimale Metadaten: UUID, Titel, Arbeitsdatum, Status, Lernort (`betrieb|uek|schule`, Standard `betrieb`), Erstell-/Änderungszeit. Profil: Name, Fachrichtung (`print|printmediatechnik|siebdruck`, Standard `print`), optional Lehrbetrieb, Lehrbeginn.

**Lehrjahr/Semester:** aus Lehrbeginn und Arbeitsdatum abgeleitet: Lehrjahr = volle Jahre seit Lehrbeginn + 1 (begrenzt auf 1–4), Semester = 1 in den ersten 6 Monaten des Lehrjahres, sonst 2. Pro Journal manuell überschreibbar (`school_year_override`). Ohne Lehrbeginn: keine Ableitung, Feld leer.

Mehrere Kategorien und Tags sowie Journal-Links möglich. **Journal-Links (AJ-10)** gibt es in zwei Formen, beide ohne Kopien: die *Verknüpfung* («Verknüpft mit», in beiden Journalen sichtbar und lösbar) und den *Link im Text* (Menüband «Einfügen → Link zu Journal», Strg+Klick öffnet; das Ziel zeigt «Erwähnt in»). Wird ein Journal gelöscht, verschwinden Verknüpfungen und Links darauf; der Text der anderen Journale bleibt. Geführte, aber frei editierbare Abschnitte:
- **Auftrag/Ausgangslage:** Was war die Aufgabe, was das Ziel? Für wen (intern/Kunde, ohne vertrauliche Details)?
- **Durchführung:** Wie und weshalb wurde gearbeitet? Text, nummerierte Schritte, Tabellen, Bilder mit Legenden; Material, Maschinen, Einstellungen, Sicherheit/Umwelt.
- **Reflexion:** Was lief gut, was war schwierig, was mache ich nächstes Mal anders? (Selbstkompetenz «eigenes Denken und Handeln reflektieren», Bildungsplan.)

Hilfetexte statt Pflichtformularen; Hilfetexte als Platzhalter, die beim Export nicht erscheinen. Status `draft|completed|archived`; `completed` ist Selbstauskunft, keine amtliche Freigabe. Automatisch speichern, sichtbarer Status und Fehlermeldung.

**Qualitätshinweise (P1, nicht blockierend):** z. B. «Reflexion ist leer», «Bild ohne Legende», «kein Arbeitsdatum». Nie als Bewertung formuliert.

## UI/UX – vertraut wie Microsoft Office
Office als **Interaktionsvorbild**, nicht als Markenkopie. Desktop-Titelleiste, Datei-Menü (Backstage-ähnlich), Ribbon-/Register-ähnliche **kompakte** Werkzeugleiste, linke Navigation, zentrale helle Dokumentfläche, untere Statusleiste. Editor-Register: **Start** (Text/Absatz), **Einfügen** (Bilder/Tabellen/Links), **Journal** (Metadaten/Beziehungen), **Exportieren**. Eigene, frei lizenzierte Symbole (z. B. Lucide/Fluent-UI-Icons nach Lizenzprüfung), keine Microsoft-Logos oder -Assets. Kontextuelle Befehle; keine riesige leere Ribbon-Fläche. Ruhige Typografie, sichtbare Seitenstruktur, klare visuelle Hierarchie. Native Windows-Dateidialoge.

Tastatur: Alt+D (Datei-Menü, Esc schliesst), Ctrl+S (sofort speichern), Ctrl+Klick (Journal-Link im Text öffnen), Ctrl+N, Ctrl+F (im Journal), Ctrl+Shift+F (Fachbuch-Suche), Ctrl+B/I/U, Ctrl+Z/Y, F6 (zwischen Navigation, Ribbon, Dokument wechseln), Alt (Ribbon-Tastentipps, P1). Sichtbarer Tastaturfokus, Tooltips mit Tastenkürzel, kontrastreiche Zustände (WCAG 2.2 AA, R-13), Windows-Kontrastdesigns respektieren, Klickziele ≥ 24 px, brauchbare Skalierung 100–200 %, Fenster ab 1024 × 640 px. Texte in Schweizer Hochdeutsch («…», ss). Status «Speichert…», «Gespeichert», «Speichern fehlgeschlagen» nur bei zutreffendem Zustand.

**Erster Start (Onboarding):** Hinweis «inoffizielles Hilfsmittel» (R-14), dann 3 Schritte – Projektordner wählen (Empfehlung: lokaler Ordner, nicht OneDrive-Root), Profil (Name, Fachrichtung, Lehrbeginn), Vorschlag-Kategorien übernehmen. Danach Beispieljournal anbieten (abwählbar).

## Architektur
- **Electron Main:** Fenster, Dateioperationen, SQLite, Export, Backups. Einziger Ort mit FS-/DB-Rechten.
- **Preload:** minimale, typisierte und validierte IPC-Schnittstelle (Schema-Validierung je Kanal, z. B. mit zod).
- **Renderer:** React, TypeScript, Tailwind, Tiptap; kein direkter Zugriff auf Node/DB/Dateisystem.
- **Shared:** Typen, IPC-Verträge und Validierungsschemas in einem gemeinsamen Paket.
- **Persistenz:** SQLite über das eingebaute `node:sqlite` ([ADR 0001](adr/0001-sqlite-adapter-node-sqlite.md)), gekapselt in einer schmalen Repository-Schicht; WAL, `synchronous=FULL`, Migrationen, Foreign Keys und Transaktionen; Rich-Text-Abschnitte als Tiptap-JSON, Bilder separat im Projektordner über UUID/relative Pfade referenziert.
- **Suche:** SQLite FTS5 mit extrahierter Klartextprojektion (Titel + Textabschnitte + Bildlegenden + Tags + Kategorien, je eigene Spalte); Tokenizer `trigram remove_diacritics 1`, damit «Farbmessung» und «farbmessung», Umlaut-Varianten und Wortteile («messung» in «Farbmessung») treffen; Umschreibungen ae/oe/ue und ss/ß als Abfragevarianten; Suchbegriffe ab 3 Zeichen. Index in jeder Änderung nachgeführt, beim Öffnen geprüft und rekonstruierbar (Befehl «Suchindex neu aufbauen» in den Einstellungen). Details: [ADR 0004](adr/0004-volltextsuche-fachbuch.md).
- **Zeit:** Arbeitsdatum als lokales ISO-Datum; Zeitstempel UTC.
- **Pfadfreigabe:** Der Hauptprozess akzeptiert vom Renderer nur Ordnerpfade, die aus dem nativen Dialog, der Zuletzt-Liste oder dem eigenen Vorschlag stammen (`PathGuard`).
- **Start:** Das zuletzt verwendete Projekt wird beim Programmstart automatisch geöffnet; gelingt das nicht (gesperrt, verschoben), erscheint der Startbildschirm.
- **Protokoll:** lokale Logdatei mit Rotation (ohne Inhalte der Journale), exportierbar für Support.

### Erlaubte Editor-Knoten (Whitelist)
Absatz, Überschrift H2–H3, Fett, Kursiv, Unterstrichen, Aufzählung, Nummerierung, Tabelle (ohne verbundene Zellen im MVP), Bild mit Legende, interner Journal-Link, externer Link (nur als Text, wird nie automatisch geöffnet ohne Bestätigung), harter Umbruch. Alles andere wird beim Einfügen (Paste aus Word/Web) bereinigt. Jeder Knoten hat eine definierte DOCX-Abbildung (siehe Word-Export).

### Logisches Schema
```
project(id,schema_version,title,created_at)
profile(id,display_name,company,apprenticeship_start,specialization)
journal(id,title,work_date,status,learning_place,school_year_override,
        sections_json,created_at,updated_at,completed_at?)
category(id,name,source,sort_order)          -- source: 'bipla'|'user'
journal_category(journal_id,category_id)
tag(id,name), journal_tag(journal_id,tag_id)
journal_link(source_journal_id,target_journal_id)
media(id,journal_id,relative_path,original_name,mime_type,caption,
      width,height,sha256,created_at)
journal_fts(journal_id,title,body,captions,tags,categories)  -- abgeleitet, Schema v2
-- P1
competency_catalog(id,profession_code,version,source_ref)
competency(catalog_id,code,parent_code,title,level)   -- a, a1, a1.1
journal_competency(journal_id,catalog_id,code)
qv_selection(id,title,created_at), qv_selection_item(selection_id,journal_id,position)
```
Integrität: keine doppelten Beziehungen oder Selbstlinks, referenzielle Integrität, Links in beide Richtungen anzeigen, Bilder nicht verwaisen lassen (Aufräumen beim Löschen und Prüfung «verwaiste Medien»). Fachbuch speichert keine Kopien.

Kompetenzkatalog: als versionierte JSON-Datei mit der App ausgeliefert (Bildungsplan 34200, Stand 12.10.2018, inkl. Wortlaut der Leistungsziele – Mitlieferung zulässig), beim Projektstart importiert; Format versioniert (`catalog_id`), aber nur eine Version wird ausgeliefert – nächste Revision frühestens in ca. 6 Jahren. Standardfilter Fachrichtung Print und Lernort Betrieb. Zuordnung immer freiwillig.

### Projektordner
```
Lernjournal-Projekt/
  journal.sqlite
  project.lock
  media/<uuid>.<ext>
  backups/
  exports/
```
Portable `.ajournal`: versioniertes ZIP mit `manifest.json` (Formatversion, App-Version, Schema-Version, Exportdatum, SHA-256 je Datei), konsistenter DB-Sicherung und allen Medien. ZIP-Slip, Pfad-Traversal, Zip-Bomben (Gesamtgrösse, Kompressionsrate, Dateianzahl), Grössenlimiten und erlaubte Dateitypen beim Import prüfen; nie unbemerkt überschreiben; Import in neues Zielprojekt. Ältere Formatversionen werden migriert, neuere mit verständlicher Meldung abgelehnt. Mehrfaches gleichzeitiges Öffnen eines Projekts durch Lock verhindern (verwaiste Locks nach Absturz erkennen); bei Cloud-synchronisierten Ordnern (OneDrive, Dropbox, Synology Drive) Konfliktrisiko anzeigen.

## Autosave, Backup und Sicherheit
Autosave nach kurzer Ruhephase (z. B. 800 ms) und spätestens alle 10 s bei Dauertippen; ausstehende Änderungen bei Navigation/Schliessen flushen; nur bestätigte DB-Transaktionen als gespeichert darstellen. Mindestens täglich nach Änderungen und bei Programmende konsistentes DB-Backup via SQLite-Backup-API, Rotation (letzte 10 + je ein Monatsstand). Medien konsistent berücksichtigen (Medien sind unveränderlich und per Hash prüfbar). Restore mit Vorschau/Bestätigung, vorzugsweise neues Zielprojekt. Externe Kopien empfehlen und Erinnerung anzeigen, wenn seit 30 Tagen kein `.ajournal`-Export erfolgt ist: lokale Backups schützen nicht vor Hardwareverlust oder Lehrabbruch-/Gerätewechsel.

Electron: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, strenge CSP, kein Remote-Content, Navigation und `window.open` blockiert, `webSecurity` an, minimale `contextBridge`, validierte IPC-Nachrichten/Dateipfade (nur innerhalb Projektordner), keine beliebigen Shell-Aufrufe (`shell.openExternal` nur nach Bestätigung und nur `https:`). Electron-Fuses: `RunAsNode` aus, `EnableNodeCliInspectArguments` aus, ASAR-Integrität an. Bildformate JPEG/PNG/WebP, Grössenlimiten, Bilder beim Import optional auf max. 2400 px verkleinern, EXIF-Ortsdaten entfernen, sichere Dateinamen. Keine Telemetrie oder Uploads (R-11). Exporthinweis zu Geschäftsgeheimnissen, Kundendaten und Personen auf Bildern (R-10).

## Word-Export
`docx` erzeugt echte Word-Absätze, Überschriften, Listen, Tabellen, Bilder und Bildlegenden statt HTML-Pseudoexport. Abbildung: Abschnittstitel → Formatvorlage «Überschrift 1/2», Absatz → «Standard», Listen → Word-Nummerierung, Bild + Legende → Bild + Formatvorlage «Beschriftung» (mit `SEQ Abbildung`-Feld inkl. vorberechneter Nummer), Überschriften und Bilder «mit nächstem Absatz zusammenhalten», Tabelle → Word-Tabelle mit Kopfzeile, interner Link → Text mit Journal-Titel (bzw. Textmarke im Sammel-DOCX). Metadaten-Kopfblock (Titel, Name, Datum, Lehrjahr, Lernort, Kategorien), optional Kopf-/Fusszeilen mit Seitenzahlen. Sammel-DOCX mit ausgewählter Reihenfolge, Titelseite, klaren Journal-Grenzen (Seitenumbruch) und aktualisierbarem Inhaltsverzeichnis-Feld (Hinweis: in Word «Felder aktualisieren»). Einfache konfigurierbare Standardgestaltung (Schrift, Grösse, Rand); beliebiger Word-Template-Import nicht P0. Export mit sicherem Dateidialog, ohne stilles Überschreiben. Änderungen in Word gehen **nicht** zurück in die App. Kein Word als Laufzeitvoraussetzung; Ergebnis zusätzlich mit LibreOffice prüfen. Details und Knoten-Abbildung: [ADR 0002](adr/0002-docx-export.md), Referenzcode `spikes/aj-00b-docx/`.

**PDF (P1, erstes P1-Ticket):** Hauptformat für die QV-Einreichung in PkOrg (keine Maximalgrösse bekannt). Aus derselben Dokumentstruktur über ein HTML-Druckbild und Electron `printToPDF` (offline, ohne Word). Schriften einbetten, Bilder für Druck/Bildschirm moderat komprimieren (Ziel ca. 150–200 ppi), Dateigrösse nach Export anzeigen, durchsuchbarer Text, Lesezeichen je Journal wenn technisch möglich. PDF ist Ausgabe, nicht Datenformat.

**Besprechung mit Berufsbildner/in:** im MVP über den normalen Sammel-Export (Filter nach Zeitraum); eigenes Besprechungs-Feature erst P2.

**QV-Mappe (P1, R-08, R-15):** Auswahl mit Reihenfolge, Filter nach Stichwort/Kategorie/Tag, um Lernberichte mit Bezug zur geplanten IPA zu finden; Zähler «x von mindestens 12» (Standard für alle Fachrichtungen, in den Einstellungen änderbar, keine harte Sperre); Hinweis «wird zusammen mit der Aufgabenstellung eingereicht»; Titelseite, Inhaltsverzeichnis; **PDF als Hauptausgabe**, DOCX optional.

## Betrieb unter Windows
- Installer per Benutzer **ohne Adminrechte** (NSIS, `perMachine: false`) plus portable EXE.
- **Code-Signing** einplanen (z. B. Azure Trusted Signing oder OV-Zertifikat), sonst SmartScreen-Warnungen; auf Schul- und Firmengeräten sind unsignierte oder portable EXE oft per AppLocker/Intune blockiert – Hinweis an Schul-IT als Dokument mitliefern.
- Keine Auto-Update-Pflicht (offline); Update = neue Version installieren, Daten bleiben im Projektordner. Optional später: manuelle Prüfung auf neue Version nur nach Klick.
- Getestet auf Windows 10 22H2 und Windows 11 (x64); ARM64 nach Möglichkeit.

## Teststrategie
- **Unit:** Migrationen, Integritätsregeln, Lehrjahr-/Semesterberechnung, Tiptap→Klartext, Tiptap→DOCX-Mapping, ZIP-Validierung (Vitest).
- **Integration:** Main-Prozess mit echter SQLite-Datei; Absturztest (Prozess während Schreibvorgang killen, danach Integritätsprüfung `PRAGMA integrity_check`).
- **E2E:** Playwright für Electron (Projekt anlegen → Journal → Export → Re-Import).
- **Golden Files:** DOCX-Exporte gegen Referenzdokumente (XML-Vergleich der relevanten Teile).
- **Manuell:** Word 365 und LibreOffice öffnen Exporte; Bildschirmleser-Stichprobe (NVDA); 200 % Skalierung.
- **CI:** GitHub Actions auf `windows-latest` (Build, Tests, Packaging).

## P0-Abnahme
1. Projekt offline anlegen (inkl. Profil mit Fachrichtung, Standard Print, und Lehrbeginn) und nach Neustart öffnen; neues Journal mit einem Klick und Titel anlegbar.
2. Journal mit drei Abschnitten, mehreren Bildern/Legenden, Lernort und Metadaten dauerhaft speichern; Lehrjahr korrekt abgeleitet.
3. Status, Duplizieren, Archivieren, Löschen funktionieren sicher (Löschen mit Bestätigung, Medien werden mit aufgeräumt).
4. Mehrfachkategorien/Tags/Links ohne Inhaltsduplikation; Vorschlag-Kategorien a–g vorhanden und änderbar.
5. Volltextsuche findet Titel, Rich-Text-Begriffe und Bildlegenden, unabhängig von Gross-/Kleinschreibung.
6. Einzel-DOCX in Word bearbeitbar: echte Formate, Bilder/Legenden; Exporthinweis erscheint.
7. Drei Journale in einer DOCX zusammenfassen, Reihenfolge und TOC vorhanden.
8. Projekt-ZIP auf zweitem Windows-PC vollständig importierbar; manipuliertes ZIP (Pfad-Traversal, falsche Prüfsumme) wird abgelehnt.
9. Bestätigte Speicherung übersteht erzwungenen Abbruch; Backup wiederherstellbar.
10. Komplett offline; Installer (ohne Adminrechte) und portable Build auf sauberem Windows getestet.
11. UI Office-vertraut, Tastaturbedienung, Kontrast und hohe DPI getestet.

## Risiken
| Risiko | Wirkung | Massnahme |
|---|---|---|
| Native SQLite-Module vs. Electron-ABI | Build bricht | **erledigt:** `node:sqlite` ohne natives Modul, Windows-CI grün (ADR 0001) |
| `node:sqlite` noch experimentell | API-Änderung bei Electron-Update | Repository-Schicht kapseln, Spike-Checks als Regressionstest, Rückfall better-sqlite3 |
| Schul-/Firmengeräte blockieren EXE | App nicht nutzbar | Code-Signing, Installer ohne Admin, IT-Merkblatt |
| Projekt im OneDrive-Ordner | DB-Korruption, Konflikte | Warnung, Lock, Backups, Empfehlung lokaler Ordner |
| Lernende verlieren Gerät/wechseln Betrieb | Datenverlust über 4 Jahre | Export-Erinnerung, `.ajournal` auf USB/NAS |
| QV-Vorgaben ändern sich | falsche Hinweise | Zahlen konfigurierbar, Quellen mit Stand, keine harten Regeln |
| App wird für offiziell gehalten | falsche Erwartungen | Hinweis «inoffizielles Hilfsmittel» (R-14), keine Verbandslogos |
| Zu viele Felder/Funktionen | Lernende brechen ab | Leitprinzip Einfachheit, Pilot-Feedback vor P1 |
| DOCX-TOC/Felder | Inhaltsverzeichnis leer | Hinweis in Word aktualisieren; Spike AJ-00b |
| Nur Windows | Lernende mit Mac ausgeschlossen | Electron erlaubt später macOS-Build (P2) |

## Implementierungshinweise
Versionen und Lizenzbedingungen aktueller Bibliotheken bei Start prüfen. Phase 0 ist abgeschlossen: SQLite (ADR 0001) und DOCX (ADR 0002) sind geklärt, Referenzcode liegt unter `spikes/`. Spike-Code darf übernommen, muss aber in die App-Struktur (TypeScript, Tests, Lint) überführt werden. Keine Features aus P1/P2 in den MVP ziehen; das Datenmodell der P1-Tabellen wird erst mit dem jeweiligen Ticket migriert. Architekturentscheide als kurze ADR unter `docs/adr/` festhalten.
