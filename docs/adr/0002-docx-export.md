# ADR 0002 – Word-Export mit `docx` und fester Knoten-Abbildung

- **Status:** angenommen, mit offenem Punkt «Prüfung in Microsoft Word» (Spike AJ-00b, 2026-11-23)
- **Kontext:** SPEC verlangt echte Word-Strukturen (Formatvorlagen, Listen, Tabellen, Bilder mit Legenden, Inhaltsverzeichnis, Seitenzahlen) ohne Word als Laufzeitvoraussetzung.

## Entscheid
- Bibliothek **`docx` 9.16** (MIT), Ausführung im Main-Prozess.
- Ein Modul `to-docx` bildet jeden erlaubten Tiptap-Knoten fest ab (Tabelle im Kopf von `spikes/aj-00b-docx/src/to-docx.ts`). Unbekannte Knoten werden **als Text** ausgegeben und als Warnung gemeldet – nie stillschweigend verworfen.
- Bild + Legende ist **ein** Editor-Knoten `figure` (Attribute `mediaId`, `caption`, `alt`). Bilddaten kommen über einen Resolver aus `media/`.
- Formatvorlagen über eingebaute Style-IDs (`Heading1–4`, `Caption`, `Hyperlink`), damit deutsches Word sie als «Überschrift 1», «Beschriftung» usw. anzeigt und das Inhaltsverzeichnis funktioniert.
- Abbildungsnummern als `SEQ Abbildung`-Feld **mit vorberechnetem Wert** (sonst zeigt LibreOffice «Abbildung :»).
- Inhaltsverzeichnis: TOC-Feld (Überschrift 1–2, mit Links), Einträge von `docx` vorbefüllt, Seitenzahlen ergänzt Word beim Öffnen (`updateFields`, Word fragt nach).
- Interne Journal-Links (`lernjournal://journal/<uuid>`) → Textmarke + interner Hyperlink im Sammel-DOCX; Ziel nicht im Export → Text mit Hinweis «(nicht in diesem Export)». Nur `http(s)` wird als externer Link geschrieben.
- Überschriften mit «mit nächstem Absatz zusammenhalten», Bild mit Legende ebenso.

## Ergebnis Spike AJ-00b
- 9 automatisierte Tests (XML-Prüfung des entpackten DOCX + LibreOffice-Konvertierung) grün.
- Visuelle Kontrolle via LibreOffice → PDF: Titelseite, Verzeichnis, Listen (verschachtelt, Neustart bei 1), Tabelle mit Kopfzeile, Bilder skaliert auf Satzspiegel, Legenden nummeriert, Links, Fusszeile «Seite X von Y».
- Gefundene und behobene Mängel: fehlende Abbildungsnummer, verwaiste Überschrift am Seitenende.

## Offen
- **Öffnen in Microsoft Word 365 (Windows)** durch einen Menschen: keine Reparaturmeldung, TOC aktualisierbar, Formatvorlagen deutsch benannt. Beispieldateien: CI-Artefakt `aj-00b-docx-beispiele`.
- Für PDF (P1) wird nicht LibreOffice verwendet (nicht mitlieferbar), sondern ein HTML-Druckbild + `printToPDF` (eigener Spike vor AJ-18).

## Konsequenzen
- Exportlogik ist reine Funktion (Journal-Daten → Dokument) und dadurch gut testbar (Golden Files).
- `docx` erzeugt das TOC ohne Seitenzahlen; das ist ein bekanntes Word-Verhalten und wird im Exportdialog erklärt.
