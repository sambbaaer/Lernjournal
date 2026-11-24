# Entwicklung – Lernjournal

## Voraussetzungen (Windows 11)
- **Node.js 24 LTS** (https://nodejs.org) – bringt npm mit.
- **Git**.
- Kein Visual Studio, kein Python: Die App braucht keine nativen Module (ADR 0001).

## Erste Schritte
```bash
npm ci
```
```bash
npm run dev
```
`npm run dev` startet Vite und Electron. Änderungen an der Oberfläche (`src/renderer`) erscheinen sofort, Änderungen am Hauptprozess (`src/main`) starten die App neu.

## Befehle
| Befehl | Zweck |
|---|---|
| `npm run dev` | Entwicklung mit Hot Reload |
| `npm run check` | Typen + Lint + Formatierung + Unit-Tests (vor jedem Commit) |
| `npm run format` | Code automatisch formatieren (Prettier) |
| `npm test` | Unit-Tests (Vitest) |
| `npm run test:e2e` | App bauen und Ende-zu-Ende-Test (Playwright) |
| `npm run dist:win` | MSIX (Testpaket mit Platzhaltern), portable EXE und NSIS-Testinstaller nach `dist/` (nur unter Windows, siehe «Paketierung») |
| `npm run dist:store` | Store-Paket (MSIX) mit Identität aus Partner Center, unsigniert ([STORE.md](STORE.md)) |
| `npm run dist:exe` | nur portable EXE + Testinstaller (z. B. signierter Release) |
| `npm run store:identity` | Zeigt die Store-Identität, mit der gebaut würde (Platzhalter oder `LERNJOURNAL_STORE_*`) |
| `npm run dist:dir` | Nur entpackter Build (schneller, zum Ausprobieren) |
| `npm run verify:package` | Fertiges Paket in `dist/` prüfen (Fuses, Inhalt, Adminrechte, MSIX-Manifest und Logos) |
| `npm run test:packaged -- <Programm>` | Selbsttest des gepackten Programms inkl. Netzwerkprotokoll |
| `npm run icon` | Programm- und Dateisymbol sowie die 45 MSIX-Logos aus den SVGs in `assets/` erzeugen |

## Ordnerstruktur
```
src/
  main/       Hauptprozess (Node): Fenster, Sicherheit, IPC, später DB und Dateien
  preload/    Brücke: stellt window.lernjournal bereit – sonst nichts
  renderer/   Oberfläche (React + Tailwind), läuft in der Sandbox
  shared/     Typen und IPC-Vertrag für alle drei Teile
e2e/          Ende-zu-Ende-Tests gegen die gebaute App
scripts/      Paketprüfung, Selbsttest von aussen, Programmsymbol (AJ-16)
assets/       Vektorquellen für Programm- und Dateisymbol
build/        Erzeugte Programm- und Dateisymbole (.ico/.png)
spikes/       Phase-0-Prototypen (nicht App-Code)
```

## Datenbank und Migrationen
```
src/main/db/
  connection.ts   openDatabase (WAL, synchronous=FULL, Fremdschlüssel), transaction, checkIntegrity
  schema-v1.ts    Grundschema – nach Veröffentlichung NIE mehr ändern
  schema-v2.ts    Suchindex (AJ-11), schema-v3.ts letzte Projektübergabe (AJ-15)
  migrations.ts   Liste aller Migrationen, migrate()
src/main/project/
  lock.ts         Projektsperre (project.lock)
```
- **Neue Spalte/Tabelle?** Nie `schema-v1.ts` ändern, sondern eine neue Migration `{ version: 2, name, up }` in `MIGRATIONS` anhängen und testen (alte Datei → neue Version, Daten bleiben).
- `migrate()` ruft **vor** dem Umbau den Hook `backup` auf (im Projekt: gewöhnliche Sicherung mit Anlass «vor-update», `backupBeforeMigration`, AJ-15), führt jede Migration in einer eigenen Transaktion aus und verweigert Dateien aus neueren Programmversionen.
- `openDatabase(file, { journalMode: 'delete' })` für eigenständige Kopien ohne `-wal`/`-shm` (z. B. in der .ajournal-Datei), `{ readOnly: true, untrusted: true }` für Dateien von aussen (`trusted_schema = OFF`, `cell_size_check`).
- **Regeln, die immer gelten müssen**, gehören als `CHECK`/`UNIQUE`/Fremdschlüssel ins Schema, nicht nur in den Code. Achtung SQLite: Ein `CHECK`, der `NULL` ergibt, gilt als erfüllt – darum `IS` statt `=` bei Funktionen wie `date()`.
- Datenbankzugriffe nur im Hauptprozess; der Renderer bekommt Daten ausschliesslich über IPC.

## Projekte (Hauptprozess)
```
src/main/project/
  project-service.ts   anlegen, öffnen (Sperre → Integrität → Migration mit Backup), schliessen, Profil
  project-handlers.ts  IPC-Handler: Freigabeliste, Zuletzt-Liste, automatisches Öffnen
  path-guard.ts        nur Pfade aus Dialog/Zuletzt-Liste/Vorschlag
  sync-detect.ts       OneDrive/Dropbox/… erkennen (Warnung)
  recent.ts            Zuletzt-Liste in den Benutzerdaten (atomar geschrieben)
src/shared/bipla.ts    Vorschlag-Kategorien a–g aus dem Bildungsplan
```
- Der Projektdienst kennt kein Electron (testbar mit Vitest); Dialoge und App-Pfade werden in `src/main/index.ts` hineingereicht.
- **Schliessen:** `closeGracefully()` ruft zuerst `beforeClose` (Sicherung beim Schliessen) – bei Projektwechsel, «Projekt schliessen» und Programmende. `close()` bleibt synchron und ohne Sicherung (nur wo vorher schon gesichert wurde, z. B. beim Ersetzen durch eine Sicherung).
- `freeFolder()` / `targetFolderFor()`: Vorschlag und «Anderen Ordner wählen» für Import und Wiederherstellung (nie in fremde Dateien oder ein bestehendes Projekt).
- E2E-Tests setzen `LERNJOURNAL_E2E_DIR`: eigene Benutzerdaten und «Dokumente» in einem Temp-Ordner (wirkt nur in der ungepackten App). `launchApp()` legt das Projekt über den echten Assistenten an.

## Journale
```
src/shared/journal.ts       Typen, Labels, leere Abschnitte, plainTextOf (Klartext)
src/shared/school-year.ts   Lehrjahr/Semester aus Lehrbeginn (reine Kalenderrechnung)
src/main/journal/           JournalService (Transaktionen + Suchindex) und IPC-Handler
src/renderer/src/journal/   actions.ts, JournalList, JournalDocument, StatusBadge
```
- Jede Änderung an einem Journal aktualisiert im selben Durchgang `journal_fts` (Suchindex, siehe «Fachbuch und Suche»).
- Bilddateien werden beim Löschen **nach** dem erfolgreichen Commit entfernt.
- Metadaten speichern nach 600 ms Ruhe und beim Verlassen der Ansicht; «Gespeichert» erscheint erst nach Bestätigung durch den Hauptprozess.

## Editor
```
src/shared/editor-schema.ts   Whitelist (Tiptap-Erweiterungen) + validateSections() für den Hauptprozess
src/renderer/src/editor/      SectionEditor, EditorContext (aktiver Editor fürs Menüband),
                              LinkDialog, save-registry (Strg+S)
```
- **Ein Schema für beide Seiten:** Was der Editor nicht kennt, wird beim Einfügen verworfen; was trotzdem ankommt, lehnt `validateSections()` im Hauptprozess ab (inkl. Link-Protokollen und Überschriftenebenen).
- Neue Formatierung? Erweiterung in `baseExtensions()` aufnehmen, DOCX-Abbildung (ADR 0002) ergänzen, Schema-Test erweitern.
- Menüband-Befehle für den Editor über `editorItem()` in `ribbon-items.ts`; `onMouseDown.preventDefault()` verhindert, dass ein Klick dem Editor die Markierung nimmt.

## Bilder
```
src/renderer/src/editor/image-processing.ts   Ausrichtung, max. 2400 px, neu kodieren (Metadaten weg)
src/renderer/src/editor/insert-image.ts       Dialog, Drag & Drop, Strg+V → media:add → Knoten «figure»
src/renderer/src/editor/FigureView.tsx        Bild + Legendenfeld im Editor
src/main/media/image-info.ts                  Format/Masse aus den Bytes (PNG, JPEG, WebP)
src/main/media/media-service.ts               speichern (atomar, SHA-256), auflösen, kopieren, aufräumen
```
- Anzeige über `app://lernjournal/media/<uuid>` – aufgelöst über die Datenbank, nie über Pfade aus der URL.
- Ein Journal darf nur eigene Bilder referenzieren (`checkAndSyncCaptions` beim Speichern).
- Aus dem Inhalt entfernte Bilder bleiben bis zum nächsten Öffnen des Projekts (Rückgängig bleibt möglich) und werden dann aufgeräumt, wenn sie älter als 1 Stunde sind.

## Kategorien und Schlagwörter
```
src/shared/taxonomy.ts                       Typen, Namensregeln (normalizeName, nameKey), zod-Schemas
src/main/taxonomy/taxonomy-service.ts        anlegen, umbenennen, zusammenführen, löschen, zuordnen
src/main/taxonomy/taxonomy-handlers.ts       IPC; jede Änderung liefert die vollständige Liste zurück
src/renderer/src/journal/TaxonomyFields.tsx  Auswahl im Journal (Kategorien-Liste, Schlagwort-Eingabe)
src/renderer/src/journal/journal-filter.ts   Filter der Journalliste (reine Logik, getestet)
src/renderer/src/project/TaxonomyManager.tsx Verwaltung in den Einstellungen
```
- **Kategorie** = fester Ordnungsbegriff (Vorschlag a–g, R-05), bleibt auch ohne Journal bestehen. **Schlagwort** = freies Stichwort; wird beim Zuordnen per Name angelegt bzw. wiederverwendet und automatisch entfernt, sobald kein Journal es mehr nutzt (auch beim Löschen eines Journals).
- **Eindeutige Namen:** Die Datenbank prüft mit `COLLATE NOCASE` (nur A–Z), der Dienst zusätzlich mit `nameKey()` (Umlaute, Unicode-NFC). Konflikte beim Umbenennen melden «… gibt es schon» und verweisen auf «Zusammenführen».
- **Zuordnungen** stehen in `JournalSummary.categoryIds/tagIds` (eine Abfrage pro Tabelle für die ganze Liste). Zusammenführen/Löschen lädt die Journalliste neu.
- Zuordnungen speichern sofort; die Kategorien-Auswahl wird bis zur Bestätigung optimistisch angezeigt und springt bei einem Fehler zurück.
- Schlagwörter und Kategorien stehen im Suchindex; Zuordnen, Umbenennen, Zusammenführen und Löschen führen die betroffenen Journale im Index nach (AJ-11).

## Journal-Verknüpfungen
```
src/shared/links.ts                        Link-Ziele (lernjournal://journal/<uuid>), Aufräumen, Suche der Auswahl
src/main/links/link-service.ts             verknüpfen, lösen, Liste inkl. «Erwähnt in», Text-Links entfernen
src/main/links/link-handlers.ts            IPC journal:links / journal:link / journal:unlink
src/renderer/src/journal/LinkFields.tsx    «Verknüpft mit» und «Erwähnt in» im Journal
src/renderer/src/journal/JournalPicker.tsx Auswahldialog mit Suche (Combobox), auch für Links im Text
```
- **Verknüpfung** = Zeile in `journal_link` (Schema v1, keine Migration). Gespeichert in einer Richtung, angezeigt in beiden; die Datenbank verbietet Selbstlinks und die Gegenrichtung (`journal_link_undirected`). Doppeltes Verknüpfen ist kein Fehler, sondern «nichts zu tun».
- **Link im Text** = Tiptap-Link mit `href` `lernjournal://journal/<uuid>`; `ALLOWED_LINK` lässt nur genau dieses Muster zu. «Erwähnt in» sucht das Ziel per `instr()` im gespeicherten JSON (kein Index nötig bei einigen hundert Journalen).
- **Löschen** eines Journals entfernt in derselben Transaktion die Text-Links darauf (`stripJournalLinks`, Text bleibt) und führt den Suchindex der betroffenen Journale nach; Verknüpfungen fallen per `ON DELETE CASCADE` weg.
- Die Auswahl sucht im Renderer über die bereits geladene Journalliste (`filterLinkCandidates`, Umlaute/ae-oe-ue egal) – bewusst nur Titel, Datum und Zuordnungen; die Volltextsuche über den Inhalt ist das Fachbuch (AJ-11).
- Ein verknüpftes Journal öffnen (`openLinkedJournal`) speichert zuerst das aktuelle – sonst sähe das Ziel einen eben eingefügten Text-Link noch nicht.
- Der Picker im Editor gibt den Fokus nicht selbst zurück (`restoreFocus={false}`), sonst springt die Einfügemarke an den Textanfang.

## Fachbuch und Suche (AJ-11)
```
src/main/db/schema-v2.ts                     Suchindex v2 (Migration 2): eigene Spalten, Trigramm-Tokenizer
src/main/search/projection.ts                Tiptap-JSON → Klartext (Text und Bildlegenden getrennt)
src/main/search/fts-query.ts                 Eingabe → sichere FTS5-Abfrage (Wörter ≥ 3 Zeichen, AND, Varianten)
src/main/search/search-index.ts              SearchIndex: sync, rebuild, ensureComplete, search
src/main/search/search-handlers.ts           IPC search:query / search:rebuild
src/shared/search.ts                         Typen, Markierungszeichen, parseMarked, queryWords
src/renderer/src/fachbuch/fachbuch-logic.ts  Themen, Ausschnitt, verwandte Schlagwörter (reine Logik, getestet)
src/renderer/src/fachbuch/FachbuchView.tsx   Ansicht: Suchfeld, Themen links, Treffer rechts
```
- **Index ist abgeleitet:** nie Datenquelle, jederzeit neu aufbaubar. Wer Journale, Titel, Inhalt oder Zuordnungen ändert, ruft in **derselben Transaktion** `search.sync(id)` bzw. `syncMany(ids)` auf. `JournalService` und `TaxonomyService` tun das bereits.
- **Beim Öffnen** prüft `ensureComplete()` den Index (fehlende/verwaiste/doppelte Zeilen, FTS5-Integrität) und baut ihn bei Bedarf neu auf. Manuell: Einstellungen → «Suchindex neu aufbauen».
- **Abfrage:** nie Nutzereingaben direkt an `MATCH` geben, immer über `buildFtsQuery()`. Wörter unter 3 Zeichen findet der Trigramm-Index nicht; die Oberfläche zeigt dann «Suchbegriffe ab 3 Zeichen».
- **Markierung:** `highlight()`/`snippet()` liefern Treffer zwischen U+0002 und U+0003; die Oberfläche baut daraus `<mark>` (`parseMarked`), nie HTML. Farbe über Token `--color-highlight`.
- **Fachbuch-Zustand** (Suchbegriff, Thema, Archiv) liegt im zentralen Zustand (`state.fachbuch`), damit die Suche beim Zurückkehren aus einem Journal erhalten bleibt; Projektwechsel setzt ihn zurück.
- **Tests:** `src/main/search/search.test.ts` (Abfrage, Projektion, Index, Neuaufbau, Migration v1 → v2), `fachbuch-logic.test.ts`, `e2e/fachbuch.test.mjs`.

## Word-Export (AJ-12, AJ-13)
```
src/shared/export.ts                       Exporthinweis R-10 (Texte), Ergebnis-Schema, formatFileSize
src/main/export/docx-content.ts            Tiptap-JSON → Word-Elemente (rein), Kontext, Nummerierung
src/main/export/docx-journal.ts            ein Journal: Titel + Textmarke, Kopfblock, Abschnitte
src/main/export/docx-document.ts           Seite, Formatvorlagen, Fusszeile; buildDocument / buildJournalDocument
src/main/export/docx-collection.ts         Sammel-DOCX: Titelseite, Inhaltsverzeichnis, Seitenumbruch je Journal
src/main/export/export-service.ts          DB → ExportJournal, Bilder laden (WebP → PNG), atomar schreiben
src/main/export/export-handlers.ts         IPC export:journalDocx / export:collectionDocx (Speichern-Dialog) / export:showFile
src/main/export/image-convert.ts           WebP → PNG im unsichtbaren, gesandboxten Fenster (Electron)
src/renderer/src/export/ExportDialog.tsx   Hinweis → Speichern → Ergebnis (Menüband, Liste, Ansicht, Datei-Menü)
src/renderer/src/export/CollectionPanel.tsx Ansicht «Export»: Journale auswählen, Reihenfolge, Titel (Sammel-DOCX)
src/renderer/src/export/collection-logic.ts Auswahl/Filter/Reihenfolge als reine Funktionen (Vitest)
```
- **Einweg:** DOCX wird nur geschrieben, nie gelesen oder abgeglichen. Vor dem Export speichert die Oberfläche Ausstehendes (`saveIfNeeded`), sonst fehlte eben Getipptes.
- **Hinweis R-10** erscheint bei jedem Export; der Kanal verlangt `noticeAccepted: true`. Den Zielpfad bestimmt ausschliesslich der Speichern-Dialog im Hauptprozess; «Im Ordner anzeigen» zeigt nur die zuletzt exportierte Datei.

**PDF und QV (AJ-18/AJ-20):** `pdf-document.ts` baut das HTML-Drucklayout aus derselben Datenaufbereitung wie DOCX. `pdf-print.ts` rendert es in einer flüchtigen und netzgesperrten Electron-Session. Der Pack-Selbsttest erzeugt auch ein PDF mit Bild. Die QV-Vormerkung in `journal.qv_selected` (Schema v6) ist Bestandteil von `.ajournal` und Sicherungen. Sie wird in der Exportansicht in die bestehende Zusammenstellung übernommen. Farbschema und konfigurierbare QV-Mindestanzahl liegen in den lokalen App-Einstellungen. [ADR 0010](adr/0010-pdf-qv-und-farbschema.md)
- **Neuer Editor-Knoten?** Abbildung in `docx-content.ts` ergänzen (sonst: Text + Hinweis «unbekannter Inhalt»), Testfall in `fixtures.ts` aufnehmen, Golden Files neu schreiben.
- **Golden Files** (`src/main/export/__golden__/`): schlägt der Vergleich fehl, zuerst prüfen, ob die Änderung gewollt ist (z. B. `docx`-Update), dann `npx vitest run src/main/export -u` und den Git-Diff der XML-Dateien ansehen.
- **Sammel-DOCX (AJ-13):** `buildCollectionDocument()` nutzt einen Kontext (`createContentContext` mit allen Journal-IDs in `inDocument`) für alle Journale – Abbildungsnummern laufen durch, Links zwischen den Journalen werden zu Sprüngen. Je Journal `journalBlocks(…, { pageBreakBefore: true })` (Absatzeigenschaft statt leerem Umbruch-Absatz), davor Titelseite und Inhaltsverzeichnis (`TableOfContents`, nur Überschrift 1), dann `buildDocument({ updateFields: true, titlePage: true })`. Die Reihenfolge der IDs im IPC-Aufruf ist die Reihenfolge im Dokument; geprüft werden Anzahl (`COLLECTION_LIMITS`), Doppelte und Titellänge, unbekannte Journale meldet der Dienst noch vor dem Speichern-Dialog. Die Zusammenstellung (IDs, Titel) liegt im App-Zustand `collection`, damit sie beim Ansichtswechsel erhalten bleibt.
- **Tests:** `src/main/export/export.test.ts` (Einzel-DOCX) und `collection.test.ts` (Sammel-DOCX): Golden Files, Abbildung, Dienst mit echter DB, IPC, LibreOffice falls installiert (eigenes Profil je Aufruf, da Vitest parallel läuft; Hilfen in `test-utils.ts`). `src/renderer/src/export/export-actions.test.ts`, `collection-logic.test.ts`; `e2e/export.test.mjs` (echte WebP-Umwandlung) und `e2e/collection.test.mjs` (Auswahl, Tastatur, Dateiinhalt) – der Speichern-Dialog wird per `app.evaluate` ersetzt. Unter Linux ohne Bildschirm: `xvfb-run -a` und `E2E_EXTRA_ARGS=--no-sandbox`.

## Projektübergabe .ajournal (AJ-14)
```
src/shared/archive.ts                      Texte, Ergebnis-/Vorschau-/Fortschritt-Schemas für die Oberfläche
src/main/archive/archive-format.ts         Format: Einträge, Manifest (zod), ARCHIVE_LIMITS, ArchiveError
src/main/archive/zip-reader.ts             misstrauischer ZIP-Leser (Namen, Struktur, Grenzen, CRC, Streams)
src/main/archive/zip-writer.ts             ZIP-Schreiber (gespeichert/Deflate, UTF-8, ohne ZIP64)
src/main/archive/archive-db.ts             snapshotDatabase (Backup-API + VACUUM), verifyImportedDatabase
src/main/archive/archive-export.ts         writeProjectArchive, exportProjectArchive (prüfen, atomar umbenennen)
src/main/archive/archive-import.ts         readManifest, inspectArchive, verifyArchive, importArchive
src/main/archive/archive-service.ts        Dienst fürs geöffnete Projekt, Fehlermeldungen, Fortschritt in Prozent
src/main/archive/archive-handlers.ts       IPC archive:* mit nativen Dialogen, Import öffnet das neue Projekt
src/main/fs-atomic.ts                      writeAtomically: Temp-Datei neben dem Ziel, dann umbenennen
src/renderer/src/archive/ArchiveDialog.tsx Dialoge «Projekt übergeben» / «Projekt importieren»
src/renderer/src/archive/archive-actions.ts Ablauf und Texte (rein, Vitest)
```
- **Format und Gründe:** [ADR 0005](adr/0005-ajournal-paketformat.md). Kurz: ZIP mit `journal.sqlite` (Backup-API, VACUUM, Journalmodus DELETE), `media/<uuid>.<ext>` und `manifest.json` (Formatversion, App-/Schemaversion, Erstellzeit, Grösse und SHA-256 je Datei).
- **Grenzen** nur in `ARCHIVE_LIMITS` ändern (nie Zahlen im Code verteilen). Der Leser prüft sie zuerst laut Verzeichnis und beim Entpacken nochmals an den echten Bytes. Funktionen bekommen `limits` als Parameter, damit Tests kleine Grenzen setzen können.
- **Keine Pfade vom Renderer:** `archive:export`, `archive:chooseImport`, `archive:chooseImportTarget`, `archive:import` und `archive:showFile` haben `request: z.undefined()`. Datei und Zielordner merkt sich der Handler zwischen den Schritten (`pending`); der Import prüft die Datei trotzdem nochmals vollständig.
- **Import** nur in neue oder leere Ordner (`inspectFolder`), bei Fehlern wird entfernt, was angelegt wurde. Das bisherige Projekt bleibt offen, bis alles bestanden ist; danach öffnet `ProjectService.open` das neue Projekt, und `OpenedProjects` (gemeinsam mit den Projekt-Handlern) nimmt es in Zuletzt-Liste und Freigabe auf.
- **Fortschritt:** Ereignis `lj:archive-progress` (Hauptprozess → Oberfläche, `archive.onProgress` in der Brücke, nur `step`/`percent` werden weitergereicht).
- **Neue Tabelle/Spalte (Migration)?** Nichts zu tun: Der Schema-Vergleich beim Import baut seine Referenz aus `MIGRATIONS`. **Neue Dateiart im Projektordner?** `MEDIA_ENTRY`/`maxEntryBytes` erweitern, `ARCHIVE_FORMAT_VERSION` erhöhen, ältere Versionen in `readManifest()` umwandeln, Tests ergänzen.
- **Projekt-ID:** Eine Importkopie behält die ID des Originals. Die Oberfläche lädt darum bei Wechsel von ID **oder** Pfad neu (`AppShell`).
- **Konsistente Kopie:** `snapshotDatabase` kopiert über eine eigene, nur lesende Verbindung in einem Schritt – nie aus der Verbindung des Programms (die bricht mit `SQLITE_LOCKED` ab, wenn währenddessen gespeichert wird; ADR 0006). Gemeinsam mit den Sicherungen (AJ-15), ebenso `finishImportedDatabase` (Migration, Suchindex, Integrität) und `recordExport`.
- **Tests:** `src/main/archive/zip.test.ts` (ZIP-Slip, Symlinks, Duplikate, Zip-Bombe mit gelogenen Grössen, Überlappung, CRC, ZIP64, Verschlüsselung, Gegenprobe mit fflate), `archive.test.ts` (Roundtrip mit Bildern, Links, Kategorien, Schlagwörtern und Suche; WAL-Inhalt; ältere Schemaversion; neuere Versionen; falsche/fehlende Hashes; manipuliertes Manifest, Bild und Datenbank; Aufräumen; Handler und IPC), `test-zip.ts` baut bösartige Archive von Hand. `archive-actions.test.ts`, `e2e/archive.test.mjs` (Übergabe, Import auf einem «zweiten Computer» über den Startbildschirm, manipulierte Datei, axe).

## Sicherungen und Wiederherstellung (AJ-15)
```
src/shared/backup.ts                       BACKUP_POLICY, EXPORT_REMINDER, Typen/Schemas, Texte, exportReminder()
src/main/backup/backup-format.ts           Ablage, IDs (UTC-Zeitstempel), Manifest (zod), BackupError
src/main/backup/rotation.ts                backupsToKeep: letzte 10 + je Monat (rein)
src/main/backup/backup-store.ts            createBackup, listBackups, verifyBackup, rotateBackups, Fingerabdruck, Bildvorrat
src/main/backup/backup-restore.ts          stageDatabase, restoreMedia, restoreAsNewProject
src/main/backup/backup-service.ts          Zeitpunkte, Warteschlange, Vorschau, Ersetzen mit Sicherheitskopie
src/main/backup/backup-handlers.ts         IPC backup:* (nur IDs, Zielordner aus Vorschlag/Dialog)
src/renderer/src/backup/                   BackupSection (Einstellungen), RestoreDialog, ExportReminderBar, backup-actions
```
- **Format und Gründe:** [ADR 0006](adr/0006-sicherungen.md). Zahlen nur in `BACKUP_POLICY` / `EXPORT_REMINDER` ändern.
- **Zeitpunkte:** `afterOpen` (Fingerabdruck ≠ neueste Sicherung), `beforeClose` und `tick()` alle 15 min (nur wenn `total_changes()` gestiegen ist), Beenden in `index.ts` (`will-quit` angehalten, höchstens `quitTimeoutMs`). Alles über `BackupService.exclusive` nacheinander. Achtung Verklemmung: Wer innerhalb von `exclusive` ein **anderes** Projekt öffnet, löst `beforeClose` aus, das ebenfalls in die Warteschlange will – darum öffnet `backup:restore` (neues Lernjournal) erst nach `restoreAsNew`.
- **Keine Pfade vom Renderer:** IDs nach `BACKUP_ID_PATTERN`; der Dienst prüft, dass die Datei existiert. Fortschritt über `lj:archive-progress` (`archive.onProgress`).
- **Neue Tabelle (Migration)?** Nichts zu tun (Fingerabdruck und Schema-Prüfung lesen `sqlite_master`). Spalten, die beim Ersetzen vom aktuellen Projekt übernommen werden sollen, in `carryOverExport` (backup-service.ts) ergänzen.
- **Node-Version:** Vitest läuft mit dem Node der Entwicklungsumgebung, die App mit dem Node in Electron (24). Beispiel: `backup(…, { rate: -1 })` geht unter Node 22, Electron lehnt es ab – darum E2E-Test `e2e/backup.test.mjs` nach Änderungen an der Kopie laufen lassen.
- **Tests:** `src/main/backup/backup.test.ts` (Inhalt, WAL, Konsistenz unter Schreiblast, unverändert, Rotation mit Bildvorrat und verstellter Uhr, beide Wiederherstellungsarten, Sicherheitskopie, beschädigte/manipulierte Sicherungen, Sicherung vor Update, Zeitpunkte, Aufräumen, IPC, Schema v3), `rotation.test.ts`, `src/shared/backup.test.ts` (Erinnerung: genau 30 Tage, nie übergeben, «Später erinnern», Uhr verstellt), `backup-actions.test.ts`, `e2e/backup.test.mjs` (Jetzt sichern, Ersetzen mit Vorschau, Sicherung beim Beenden, Erinnerung, axe).

## Lokaler MCP-Zugang

`src/main/mcp` stellt mit dem offiziellen TypeScript-SDK Streamable HTTP bereit. Der Listener und seine Vorschläge gehören zum aktuell geöffneten Projekt. Electron-IPC dient zur Aktivierung, zum Kopieren der Verbindungsdaten und zur Freigabe einzelner Vorschläge in der App. Bearbeitungen verwenden eine Revision des gespeicherten Journals und die bestehende Editor-Validierung. `e2e/mcp.test.mjs` prüft den vollständigen Arbeitsablauf über HTTP und die Oberfläche. [ADR 0011](adr/0011-lokaler-mcp-zugang.md)

## Speichern (Autosave)
- **Wann:** 800 ms nach der letzten Änderung, bei Dauertippen spätestens alle 10 s, beim Verlassen eines Journals, vor Projektwechseln, mit Strg+S und vor dem Schliessen des Fensters.
- **Anzeige:** «Speichert …» → «Gespeichert» erst nach Bestätigung durch den Hauptprozess (`synchronous=FULL`). Bei Fehlern «Speichern fehlgeschlagen» mit Knopf «Erneut versuchen» und automatischem Wiederholversuch nach 2/5/10/30 s – die Änderungen bleiben im Speicher und gehen nicht verloren.
- **Schliessen:** `src/main/close-guard.ts` hält das Schliessen an, die Oberfläche speichert (`app.onBeforeClose` → `app.closeReady`), bei Fehler fragt ein Windows-Dialog nach. Antwortet die Oberfläche nicht innert 5 s, wird trotzdem geschlossen.
- **Tests:** `src/main/db/crash.test.ts` (Schreibprozess hart beenden) und `e2e/autosave.test.mjs` (App schliessen, SIGKILL, gesperrte Datenbank). In E2E-Tests mit `waitForNewSave()` auf einen *neuen* Speichervorgang warten.
- **Statusanzeige:** Ein geladenes Journal zeigt «Gespeichert». Ausstehende und laufende Schreibvorgänge für den Inhalt, die Zuordnungen und Verknüpfungen werden getrennt erfasst. «Gespeichert» erscheint nach der Bestätigung im Hauptprozess wieder und führt zur Sicherungsliste. Ein Fehler bleibt sichtbar, bis erneut gespeichert ist.
- **Neues Journal (Strg+N, AJ-17):** `createJournal` setzt zuerst `journalCreating` – das bisherige Journal wird ausgeblendet (und speichert dabei), `NewJournalPending` zeigt ein Titelfeld mit Fokus. Erst `journalCreated` öffnet das neue Journal; den Titel aus dem Platzhalter (`state.newJournalTitle`) übernimmt `JournalDocument` beim ersten Anzeigen und speichert ihn. Fokus per `useLayoutEffect`, damit keine Taste zwischen Platzhalter und Journal verloren geht. Ohne das landete, wer sofort tippte, im vorherigen Journal. E2E: `journal` «Strg+N und sofort tippen …» verzögert dafür `journal:create` direkt an der Handler-Tabelle von `ipcMain`.

## Abnahme und Tests unter Windows (AJ-17)
- **Abnahme-Matrix:** [ABNAHME.md](ABNAHME.md) ordnet jedem der elf P0-Punkte der SPEC Tests und CI-Läufe zu und enthält die manuelle Checkliste. Neue P0-relevante Tests dort eintragen. `e2e/abnahme.test.mjs` spielt die Punkte 1–3 als Ablauf einer lernenden Person durch.
- **Windows ist viel langsamer:** Die Datenbank läuft auch in Tests mit `synchronous=FULL`; jedes COMMIT wartet auf den Datenträger, in der Windows-CI 20–30 × länger als unter Linux. Darum: viele Einfügungen in **einer** Transaktion; nur wenige ganze Sicherungen/Übergaben je Test; `HEAVY_TIMEOUT` (`src/main/test-project.ts`, 60 s) nur für Dateien, die viele echte Projekte und Sicherungen schreiben (`backup.test.ts`, `archive.test.ts`), sonst gilt der Vitest-Standard von 5 s.
- **Schreiben während einer Kopie:** `whileWriting(db, write, task)` aus `test-project.ts` benutzen – endet sicher mit der Aufgabe und schreibt nie in eine geschlossene Datenbank.
- **Offene Dateien:** Unter Windows lassen sich offene Datenbanken nicht löschen (`EPERM`). Asynchrones Schliessen (`closeGracefully`, IPC `project:close`) immer abwarten, bevor ein Test Ordner entfernt.
- **E2E nach Strg+N:** Tests dürfen sofort tippen (das prüft der Strg+N-Regressionstest). Wer mehrere Bilder einfügt, tippt die Legende ins fokussierte Feld des neuen Bildes statt `getByLabel('Bildlegende').last()` zu füllen (das kann noch auf das vorherige Bild zeigen).

## Oberfläche (Renderer)
```
src/renderer/src/
  state/      app-state.ts (Reducer), commands.ts (Befehle + Tastenkürzel),
              shortcuts.ts, regions.ts (F6) – reine Logik, mit Vitest getestet
  shell/      AppShell, Ribbon (+ ribbon-items.ts), NavigationPane, Backstage, StatusBar
  views/      Start, Journale, Fachbuch, Export, Einstellungen
```
- **Befehle** stehen genau einmal in `state/commands.ts` (Text, Kürzel, Verfügbarkeit). Menüband, Tooltips und Tastatur lesen daraus – nie Kürzel doppelt verdrahten.
- **Nicht verfügbare Befehle** bekommen `aria-disabled` und einen Grund (Tooltip), nicht `disabled` – so bleiben sie per Tastatur erreichbar.
- **Farben** nur über die Tokens in `styles.css` (Kontraste dort dokumentiert). Auswahl immer zusätzlich mit Rahmen/Balken markieren (Windows-Kontrastmodus).
- **Speicherstatus:** «Gespeichert» und «Sicherungen» nutzen denselben Weg zur Sicherungsliste wie «Datei → Info» (`showBackups`).
- **E2E** (`e2e/shell.test.mjs`) prüft Tastatur, Fokus und Barrierefreiheit mit axe-core (WCAG 2.2 AA). Neue Ansichten in den axe-Test aufnehmen.

## Einen neuen IPC-Befehl hinzufügen (Muster)
1. **Vertrag** in `src/shared/ipc.ts`: Kanal mit zod-Schema für `request` und `response`.
2. **Brücke** in `src/shared/api.ts` (Typ) und `src/preload/index.ts` (Funktion) – fachlich benennen.
3. **Umsetzung** in `src/main/index.ts` im Objekt von `createIpcDispatcher`. TypeScript meldet einen Fehler, solange ein Kanal aus dem Vertrag fehlt.
4. **Test** in `src/main/*.test.ts`: gültige und ungültige Daten.

Der Rahmen (`src/main/ipc-handler.ts`) prüft automatisch Absender, Kanal und Daten und liefert immer `{ ok, data }` oder `{ ok: false, error }`.

## Paketierung, Release und Code-Signing (AJ-16, AJ-16b)
Verteilung ([ADR 0008](adr/0008-microsoft-store-und-portable.md)): **Microsoft Store (MSIX)** als Hauptweg, **portable EXE** als Release ohne Store, **NSIS-Installer** als Testinstaller/Alternative (lokale Tests, Schul-IT ohne Store).
```
electron-builder.ts          Konfiguration (MSIX + Store-Identität, portable EXE, Testinstaller, Fuses, Signing)
build/appxmanifest.xml       Manifest-Vorlage des MSIX (wie electron-builder, plus Namensraum uap3)
build/appx-extensions.xml    einzige Manifest-Erweiterung: Befehlszeilen-Aufruf «lernjournal»
build/appx/                  Logos/Kacheln des MSIX (erzeugt, Liste in scripts/appx-assets.ts)
src/main/distribution.ts     Verteilungsart (Store/portable/installiert) für «Info» und Selbsttest
scripts/dist-store.mjs       Store-Paket: verlangt echte Identität, prüft Version, baut unsigniert
scripts/store-identity.mjs   gibt die Store-Identität als JSON aus (CI: Subject des Testzertifikats)
src/main/self-test.ts        Selbsttest im Programm (LERNJOURNAL_SMOKE_TEST, Bericht, Exitcode)
scripts/self-test.mjs        Selbsttest von aussen: Phasen fuses/create/reopen + Netzwerkprotokoll
scripts/verify-package.mjs   Paket prüfen: Fuses, app.asar, Manifest asInvoker, MSIX, SHA256SUMS.txt
scripts/package-checks.ts    reine Prüffunktionen (Vitest: scripts/packaging.test.ts)
scripts/render-icon.mjs      assets/*.svg → icon.png, icon.ico, ajournal.ico + build/appx/*.png (Electron zeichnet)
docs/IT-MERKBLATT.md         Merkblatt für Schul-IT und Lehrbetriebe
docs/STORE.md                Store-Einreichung Schritt für Schritt, Entwurf Store-Eintrag
docs/DATENSCHUTZ.md          Entwurf Datenschutzerklärung (für den Store öffentlich ablegen)
```
Gründe und Abwägungen: [ADR 0007](adr/0007-paketierung-und-signing.md), [ADR 0008](adr/0008-microsoft-store-und-portable.md).

**Release-Builds (unter Windows), Version = `version` in `package.json` (`Major.Minor.Patch`, keine Vorabversion – im MSIX wird daraus `x.y.z.0`):**
```bash
npm ci
npm run check
# 1) Store-Paket – Identität aus Partner Center, siehe docs/STORE.md
#    (PowerShell: $env:LERNJOURNAL_STORE_IDENTITY_NAME = '…' usw.)
npm run dist:store
npm run verify:package
# 2) Portable EXE und Testinstaller (optional signiert, siehe «Code-Signing»)
npm run dist:exe
npm run verify:package -- --checksums
npm run test:packaged -- dist/win-unpacked/Lernjournal.exe --phases fuses,create,reopen
```
Ergebnis in `dist/`: `Lernjournal-Store-<Version>.msix` (unsigniert, für Partner Center), `Lernjournal-Portable-<Version>.exe`, `Lernjournal-Setup-<Version>.exe`, `SHA256SUMS.txt` (für Hash-Regeln der Schul-IT). Vor der Weitergabe `docs/IT-MERKBLATT.md` (Stand, Signaturstatus) nachführen. Zum Ausprobieren baut `npm run dist:win` alle drei auf einmal (MSIX mit Platzhalter-Identität).

**Store-Identität** – nur über Umgebungsvariablen, nie ins Repository: `LERNJOURNAL_STORE_IDENTITY_NAME`, `LERNJOURNAL_STORE_PUBLISHER` («CN=…»), `LERNJOURNAL_STORE_PUBLISHER_DISPLAY_NAME` (alle drei oder keine), optional `LERNJOURNAL_STORE_DISPLAY_NAME`. Ohne sie gelten Platzhalter mit «PLATZHALTER» im Namen; `LERNJOURNAL_REQUIRE_STORE_IDENTITY=1` (setzt `dist:store` selbst) bricht dann ab. Application-Id `Lernjournal` ist fest. Das Store-Paket wird nicht signiert – der Store signiert es.

**CI (Job `paket`):** baut alle drei Ziele, signiert das MSIX mit einem pro Lauf erzeugten, selbstsignierten Testzertifikat (`New-SelfSignedCertificate`, Subject = Publisher-Platzhalter, signiert mit `signtool` direkt aus dem Zertifikatsspeicher – kein `.pfx`, kein Passwort), prüft das Paket, vertraut dem Zertifikat (`LocalMachine\TrustedPeople`), installiert mit `Add-AppxPackage`, startet den Selbsttest über den Befehlszeilen-Aufruf `%LOCALAPPDATA%\Microsoft\WindowsApps\lernjournal.exe` (nur so mit Paketidentität und trotzdem mit Umgebungsvariablen; `--expect-distribution store`), prüft die Umleitung der App-Daten in den Paketordner und deinstalliert mit `Remove-AppxPackage` (Paketordner weg, Projektordner samt Sicherungen da). Danach Testinstaller (stille Installation, Selbsttest, Deinstallation) und portable EXE. Artefakte: `lernjournal-msix-testsigniert` (MSIX, `Lernjournal-Testzertifikat.cer`, `SHA256SUMS.txt` – nur zum Testen), `lernjournal-windows` (portable EXE, Testinstaller, `SHA256SUMS.txt`), `lernjournal-pruefberichte`. Job `zertifizierung` (nach `paket`, macht die CI nicht rot): Windows App Certification Kit (auf `windows-latest` vorhanden), Befunde im Protokoll, Bericht als `lernjournal-wack-bericht`; derzeit Gesamtergebnis PASS, nur der optionale Test «Blocked executables» schlägt an (ADR 0008).

**MSIX-Besonderheiten** (geprüft, ADR 0008): Programmordner schreibgeschützt (Lernjournal schreibt nie neben das Programm – so lassen); `%APPDATA%` wird in den Paketordner umgeleitet und beim Deinstallieren gelöscht (nur Zuletzt-Liste und Zwischenspeicher); Projektordner, Sicherungen, Exporte und Sperrdatei liegen ausserhalb. **Neue Funktion, die Dateien schreibt:** nie in AppData oder den Programmordner, wenn die Daten eine Deinstallation überleben müssen – sie gehören in den Projektordner.

**Unter Linux** lassen sich weder der Testinstaller (NSIS braucht Wine) noch das MSIX (electron-builder verlangt Windows) bauen; die MSIX-Konfiguration, Identität, Version, Manifest-Vorlage und alle Logos sichern Unit-Tests ab (`scripts/packaging.test.ts`). Prüfbar sind: `npx electron-builder --linux dir` bzw. `--win dir` (Inhalt von `app.asar`, Fuses der Windows-EXE) mit `npm run verify:package`, und der Selbsttest der Linux-Fassung: `E2E_EXTRA_ARGS=--no-sandbox xvfb-run -a npm run test:packaged -- dist/linux-unpacked/lernjournal --phases fuses,create,reopen`. `dist/` danach löschen (gross).

**Code-Signing** (portable EXE und Testinstaller; das Store-Paket signiert der Store) – nur über Umgebungsvariablen, nie Zertifikate oder Passwörter ins Repository. Signierte Builds mit `npm run dist:exe`, **nicht** mit `dist:win`: electron-builder würde sonst auch das MSIX mit dem eigenen Zertifikat signieren wollen, dessen Antragsteller nie zum Store-Publisher passt (Abbruch).
- **Zertifikat (OV/EV, `.pfx`):** `CSC_LINK` (Pfad, `https://`-URL oder Base64 der `.pfx`) und `CSC_KEY_PASSWORD` setzen, dann `npm run dist:exe`. Signiert werden Programm, Installer, portable EXE und Deinstallationsprogramm mit SHA-256 und Zeitstempel (`http://timestamp.digicert.com`; die Signatur bleibt nach Ablauf des Zertifikats gültig). EV-Zertifikate auf Hardware-Token brauchen stattdessen `win.signtoolOptions.certificateSubjectName` bzw. `certificateSha1` – dann in `signingOptions()` ergänzen.
- **Azure Trusted Signing:** `LERNJOURNAL_AZURE_SIGN_ENDPOINT` (z. B. `https://weu.codesigning.azure.net`), `LERNJOURNAL_AZURE_SIGN_ACCOUNT`, `LERNJOURNAL_AZURE_SIGN_PROFILE`, `LERNJOURNAL_AZURE_SIGN_PUBLISHER` (genau wie im Zertifikat) sowie die Anmeldung `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`. electron-builder installiert dafür das PowerShell-Modul `TrustedSigning` (nur Windows).
- **Release erzwingen:** `LERNJOURNAL_REQUIRE_SIGNING=1` – ohne gültige Signatur bricht der Build ab, statt unsigniert zu entstehen.
- **In GitHub Actions:** Zertifikat als Base64 in einem Repository-Secret ablegen und nur im Release-Schritt als `env` übergeben (`CSC_LINK: ${{ secrets.WIN_CSC_LINK }}`, `CSC_KEY_PASSWORD: ${{ secrets.WIN_CSC_KEY_PASSWORD }}`, `LERNJOURNAL_REQUIRE_SIGNING: '1'`). Die normale CI baut bewusst unsigniert.
- **Prüfen:** Rechtsklick → Eigenschaften → «Digitale Signaturen» oder `Get-AuthenticodeSignature dist\*.exe`. Danach Herausgeberregel und Signaturstatus im IT-Merkblatt nachführen.
- **Ohne Signatur:** SmartScreen warnt nach dem Herunterladen («Weitere Informationen» → «Trotzdem ausführen»), verwaltete Geräte blockieren oft (IT-Merkblatt). Auch mit Signatur kann SmartScreen anfangs warnen, bis genug Reputation besteht.

**Selbsttest** (`LERNJOURNAL_SMOKE_TEST`, ADR 0007): Weil Playwright sich wegen der Fuses nicht mit dem gepackten Programm verbinden kann, steuert sich das Programm selbst über die Brücke (`create`: Projekt, Journal mit Bild, Suche, Word, `.ajournal`, schliessen; `reopen`: nach Neustart öffnen, Inhalt, Suche, Sicherung, Import) und schreibt `selbsttest-<Phase>.json` in `LERNJOURNAL_SMOKE_DIR` (dort liegen auch Benutzerdaten und «Dokumente»). Speichern-Dialoge bestätigen im Selbsttest den Vorschlag (`chooseSavePath` in `index.ts`), Öffnen-Dialoge gelten als abgebrochen. Die Abläufe in `self-test.ts` werden per `Function.toString` ins Fenster geschickt – sie dürfen nichts aus dem Modul verwenden (Test in einer leeren `vm`-Umgebung). **Neue Funktion, die das Paket betrifft** (z. B. neue Laufzeitabhängigkeit, neues Fenster): Selbsttest erweitern und `npm run verify:package` laufen lassen.

**Offline-Nachweis:** `scripts/self-test.mjs` startet jede Phase mit `--log-net-log`; `externalNetworkActivity()` meldet jede Anfrage, Namensauflösung oder Verbindung zu einem fremden Host. Das Protokoll fängt auch Anfragen von Chromium selbst, die an `session.webRequest` vorbeigehen (so wurden der Wörterbuch-Download der Rechtschreibprüfung – umgeleitet auf `app://lernjournal/spellcheck/` – und unter Windows die WPAD-Proxy-Suche gefunden – abgeschaltet mit `--no-proxy-server`). Hinweis: Ohne Wörterbuch ist die Rechtschreibprüfung im Editor vorerst stumm.

**Paketinhalt:** Neue Laufzeitabhängigkeit → in `dependencies`, `npm run verify:package` prüft, dass sie (samt ihren Abhängigkeiten) in `app.asar` liegt und nichts aus `devDependencies`. Ballast einer Abhängigkeit (Browser-Fassungen, Quellen) über `files` in `electron-builder.ts` ausschliessen – der Selbsttest zeigt, ob das Programm danach noch läuft.

**Symbole:** `assets/app-icon.svg` und `assets/file-icon.svg` aus Illustrator aktualisieren, dann `npm run icon` ausführen und die erzeugten `build/icon.ico`, `build/icon.png`, `build/ajournal.ico` und `build/appx/*.png` committen. Neue Logo-Grösse für das MSIX: in `scripts/appx-assets.ts` ergänzen (Test prüft Dateien und Grössen).

## Sicherheitsregeln (Kurzfassung, Details SPEC)
- Renderer importiert nie `electron` oder `node:*` – ESLint verhindert das.
- Fenster nur über `secureWebPreferences()` erstellen.
- Oberfläche wird im fertigen Programm über `app://lernjournal/` geladen, mit strenger CSP; Internetzugriffe sind blockiert.
- Die gepackte App hat Debug- und Node-Schalter per Electron-Fuses abgeschaltet (`electron-builder.ts`); die CI prüft sie an der fertigen EXE und versucht den Missbrauch (Selbsttest-Phase `fuses`).

## Abhängigkeiten
- `dependencies`: nur, was der **Hauptprozess zur Laufzeit** braucht (`zod`, `docx`, `@modelcontextprotocol/server`). Diese Pakete und ihre Abhängigkeiten landen im Installer. `npm run verify:package` prüft den Inhalt. ZIP für `.ajournal` verwendet `node:zlib` (ADR 0005).
- `devDependencies`: alles andere, auch React – Vite bündelt die Oberfläche ohnehin in eine Datei.
- Versionen sind exakt gepinnt. Aktualisieren bewusst und mit `npm run check` + `npm run test:e2e`.
- Bekannt: `npm audit` meldet eine mittlere Schwachstelle in `minimatch` innerhalb von electron-builder (nur Build-Zeit, nicht im Installer).
- TypeScript bleibt auf 6.0, bis typescript-eslint TypeScript 7 unterstützt.
