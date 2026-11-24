# ADR 0002 – Word-Export mit `docx` und fester Knoten-Abbildung

- **Status:** angenommen, mit offenem Punkt «Prüfung in Microsoft Word» (Spike AJ-00b, 2026-11-23); umgesetzt für das Einzel-DOCX in AJ-12 und das Sammel-DOCX in AJ-13 (2026-11-24)
- **Kontext:** SPEC verlangt echte Word-Strukturen (Formatvorlagen, Listen, Tabellen, Bilder mit Legenden, Inhaltsverzeichnis, Seitenzahlen) ohne Word als Laufzeitvoraussetzung.

## Entscheid
- Bibliothek **`docx` 9.16** (MIT), Ausführung im Main-Prozess.
- Ein Modul `to-docx` bildet jeden erlaubten Tiptap-Knoten fest ab (Tabelle im Kopf von `spikes/aj-00b-docx/src/to-docx.ts`). Unbekannte Knoten werden **als Text** ausgegeben und als Warnung gemeldet – nie stillschweigend verworfen.
- Bild + Legende ist **ein** Editor-Knoten `figure` (Attribute `mediaId`, `caption`, `alt`). Bilddaten kommen über einen Resolver aus `media/`.
- Formatvorlagen über eingebaute Style-IDs (`Heading1–4`, `Caption`, `Hyperlink`), damit deutsches Word sie als «Überschrift 1», «Beschriftung» usw. anzeigt und das Inhaltsverzeichnis funktioniert.
- Abbildungsnummern als `SEQ Abbildung`-Feld **mit vorberechnetem Wert** (sonst zeigt LibreOffice «Abbildung :»).
- Inhaltsverzeichnis: TOC-Feld (mit Links), Einträge von `docx` vorbefüllt, Seitenzahlen ergänzt Word beim Öffnen (`updateFields`, Word fragt nach). Im Spike Überschrift 1–2, in der App (AJ-13) nur Überschrift 1 = Journaltitel.
- Interne Journal-Links (`lernjournal://journal/<uuid>`) → Textmarke + interner Hyperlink, wenn das Ziel im selben Dokument steht (Sammel-DOCX); sonst Text mit Hinweis «(siehe Journal «Titel»)», sofern der Linktext den Titel nicht schon nennt (AJ-12, statt «nicht in diesem Export» – für Lesende eines Einzel-DOCX aussagekräftiger). Nur `http(s)` wird als externer Link geschrieben.
- Überschriften mit «mit nächstem Absatz zusammenhalten», Bild mit Legende ebenso.

## Ergebnis Spike AJ-00b
- 9 automatisierte Tests (XML-Prüfung des entpackten DOCX + LibreOffice-Konvertierung) grün.
- Visuelle Kontrolle via LibreOffice → PDF: Titelseite, Verzeichnis, Listen (verschachtelt, Neustart bei 1), Tabelle mit Kopfzeile, Bilder skaliert auf Satzspiegel, Legenden nummeriert, Links, Fusszeile «Seite X von Y».
- Gefundene und behobene Mängel: fehlende Abbildungsnummer, verwaiste Überschrift am Seitenende.

## Umsetzung AJ-12 (Einzel-DOCX)
- **Bausteine** unter `src/main/export/`, rein und ohne Electron: `docx-content.ts` (Knoten-Abbildung, Kontext mit Abbildungs-/Listenzähler und Link-Zielen), `docx-journal.ts` (Titel mit Textmarke, Kopfblock, Abschnitte), `docx-document.ts` (Seite, Formatvorlagen, Nummerierung, Fusszeile; `buildDocument` für Einzel- und Sammel-DOCX). Der Exportdienst lädt Journal, Namen und Bilder aus der Datenbank; IPC-Kanal `export:journalDocx` mit nativem Speichern-Dialog im Hauptprozess.
- **Ergänzt gegenüber dem Spike:** Folgeabsätze im Listenpunkt ohne eigene Nummer, Startwert nummerierter Listen, Kopfzellen mit beliebigem Inhalt fett, Bilder in Tabellenzellen auf Zellbreite, feste Spaltenbreiten (Twips statt Prozent), Entfernen von in XML verbotenen Zeichen, verständliche Hinweise statt technischer Warnungen.
- **WebP:** `docx` bettet nur PNG/JPEG sicher ein, Word zeigt WebP nicht zuverlässig, `nativeImage` kann kein WebP. Darum Umwandlung in einem unsichtbaren, gesandboxten Fenster ohne Preload (`about:blank`, `createImageBitmap` + `OffscreenCanvas`). Verworfen: WebP-Decoder als Zusatzbibliothek (WASM/nativ), Umwandlung im Hauptfenster (Renderer müsste Bilddaten zurückschicken).
- **Bibliothek:** `docx` 9.16.0 (MIT, neueste Version bei Umsetzung) als Laufzeitabhängigkeit des Hauptprozesses.
- **Golden Files:** `src/main/export/__golden__/` – normalisiertes `document.xml`, `styles.xml`, `numbering.xml`, `footer1.xml` und Beziehungen; zufällige bzw. prozessweit gezählte IDs werden in Auftretensreihenfolge durchnummeriert. LibreOffice-Gegenprobe im Unit-Test, wenn installiert.

## Umsetzung AJ-13 (Sammel-DOCX)
- **Baustein** `docx-collection.ts` (rein): Titelseite → Inhaltsverzeichnis → Journale. Ein gemeinsamer Inhaltskontext für alle Journale: Abbildungsnummern laufen durch, Links auf enthaltene Journale werden zu Sprüngen (Textmarke am Journaltitel), Links auf andere bleiben Text mit «(siehe Journal «Titel»)». Hinweise (z. B. fehlendes Bild) werden je Journal gesammelt und mit dem Journaltitel versehen.
- **Titelseite:** Formatvorlagen «Title»/«Subtitle» (deutsches Word: «Titel»/«Untertitel»), Inhalt aus Profil und Journalen (Titel frei, Standard «Lerndokumentation»; Name, Lehrbetrieb, «Medientechnologin/Medientechnologe EFZ, Fachrichtung …», Zeitraum nach Arbeitsdatum, Anzahl, Erstelldatum mit «inoffizielles Hilfsmittel», R-14). «Erste Seite anders» (`titlePg`) mit leerer Fusszeile; ab Seite 2 die normale Fusszeile. Keine QV-Angaben (Zähler, Einreichungshinweis): das ist die QV-Mappe (P1, AJ-20).
- **Inhaltsverzeichnis nur über Überschrift 1** (Journaltitel) statt 1–2: Die Abschnitte «Auftrag / Durchführung / Reflexion» heissen in jedem Journal gleich und würden das Verzeichnis nur verdreifachen; Word zeigt sie im Navigationsbereich. Überschrift «Inhaltsverzeichnis» mit eigener Formatvorlage «TOC Heading», damit sie nicht im eigenen Verzeichnis steht. Das Feld ist «dirty» und `updateFields` gesetzt; der Exportdialog erklärt die Rückfrage von Word (`COLLECTION_TOC_HINT`).
- **Seitenumbruch je Journal** als Absatzeigenschaft «Seitenumbruch oberhalb» der Überschrift 1 (nicht als eigener Absatz mit Umbruch): keine Leerzeile oben auf der Seite, und die Grenze wandert beim Bearbeiten in Word mit der Überschrift. Ebenso vor dem Inhaltsverzeichnis.
- **IPC** `export:collectionDocx`: nur IDs (Reihenfolge = Dokument), Titel und Bestätigung R-10. zod prüft 1–500 gültige IDs ohne Doppelte (technische Grenze, keine Vorgabe) und Titel ≤ 150 Zeichen; unbekannte Journale meldet der Dienst vor dem Speichern-Dialog. Dateiname «JJJJ-MM-TT Titel.docx» mit dem Exportdatum. Ein Export zur Zeit (gemeinsam mit dem Einzel-DOCX).
- **Golden Files** `sammel.*` (Dokument, Beziehungen, Formatvorlagen, leere Fusszeile der Titelseite); die Normalisierung nummeriert zusätzlich die Textmarken «_TocN» des Verzeichnisses. Das Einzel-DOCX ist unverändert (Titelseiten-Formatvorlagen nur im Sammel-DOCX).

## Offen
- **Öffnen in Microsoft Word 365 (Windows)** durch einen Menschen: keine Reparaturmeldung, TOC aktualisierbar, Formatvorlagen deutsch benannt. Beispieldateien: CI-Artefakt `aj-00b-docx-beispiele`; für die App ein Export aus `npm run dev` (Testjournal mit Liste, Tabelle, Bild; für das Sammel-DOCX drei Journale mit einem Link untereinander – Titelseite ohne Fusszeile, Rückfrage «Felder aktualisieren», Seitenzahlen im Verzeichnis, Sprung per Strg+Klick). Automatisch geprüft sind bisher nur XML-Struktur und LibreOffice.
- **Word-Design in den Einstellungen** (Schrift, Grösse, Rand): im Code als `DocxDesign` vorbereitet (Standard Calibri 11 pt, Rand 2,5 cm), noch ohne Oberfläche.
- Für PDF (P1) wird nicht LibreOffice verwendet (nicht mitlieferbar), sondern ein HTML-Druckbild + `printToPDF` (eigener Spike vor AJ-18).

## Konsequenzen
- Exportlogik ist reine Funktion (Journal-Daten → Dokument) und dadurch gut testbar (Golden Files).
- `docx` erzeugt das TOC ohne Seitenzahlen (die kennt erst Word nach dem Umbruch); das ist ein bekanntes Word-Verhalten und wird im Exportdialog erklärt. LibreOffice zeigt die vorbefüllten Titel ohne Seitenzahlen.
