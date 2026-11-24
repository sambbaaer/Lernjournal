# ADR 0002 – Word-Export mit `docx` und fester Knoten-Abbildung

- **Status:** angenommen, mit offenem Punkt «Prüfung in Microsoft Word» (Spike AJ-00b, 2026-11-23); umgesetzt für das Einzel-DOCX in AJ-12 (2026-11-24)
- **Kontext:** SPEC verlangt echte Word-Strukturen (Formatvorlagen, Listen, Tabellen, Bilder mit Legenden, Inhaltsverzeichnis, Seitenzahlen) ohne Word als Laufzeitvoraussetzung.

## Entscheid
- Bibliothek **`docx` 9.16** (MIT), Ausführung im Main-Prozess.
- Ein Modul `to-docx` bildet jeden erlaubten Tiptap-Knoten fest ab (Tabelle im Kopf von `spikes/aj-00b-docx/src/to-docx.ts`). Unbekannte Knoten werden **als Text** ausgegeben und als Warnung gemeldet – nie stillschweigend verworfen.
- Bild + Legende ist **ein** Editor-Knoten `figure` (Attribute `mediaId`, `caption`, `alt`). Bilddaten kommen über einen Resolver aus `media/`.
- Formatvorlagen über eingebaute Style-IDs (`Heading1–4`, `Caption`, `Hyperlink`), damit deutsches Word sie als «Überschrift 1», «Beschriftung» usw. anzeigt und das Inhaltsverzeichnis funktioniert.
- Abbildungsnummern als `SEQ Abbildung`-Feld **mit vorberechnetem Wert** (sonst zeigt LibreOffice «Abbildung :»).
- Inhaltsverzeichnis: TOC-Feld (Überschrift 1–2, mit Links), Einträge von `docx` vorbefüllt, Seitenzahlen ergänzt Word beim Öffnen (`updateFields`, Word fragt nach).
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

## Offen
- **Öffnen in Microsoft Word 365 (Windows)** durch einen Menschen: keine Reparaturmeldung, TOC aktualisierbar, Formatvorlagen deutsch benannt. Beispieldateien: CI-Artefakt `aj-00b-docx-beispiele`; für das Einzel-DOCX der App ein Export aus `npm run dev` (Testjournal mit Liste, Tabelle, Bild). Automatisch geprüft sind bisher nur XML-Struktur und LibreOffice.
- **Word-Design in den Einstellungen** (Schrift, Grösse, Rand): im Code als `DocxDesign` vorbereitet (Standard Calibri 11 pt, Rand 2,5 cm), noch ohne Oberfläche.
- Für PDF (P1) wird nicht LibreOffice verwendet (nicht mitlieferbar), sondern ein HTML-Druckbild + `printToPDF` (eigener Spike vor AJ-18).

## Konsequenzen
- Exportlogik ist reine Funktion (Journal-Daten → Dokument) und dadurch gut testbar (Golden Files).
- `docx` erzeugt das TOC ohne Seitenzahlen; das ist ein bekanntes Word-Verhalten und wird im Exportdialog erklärt.
