# ADR 0012 – Bausteine, Querverweise, Merkstellen und Bildbeschriftung

**Status** angenommen am 25.11.2026.

## Kontext

Nach der Store-Veröffentlichung wünschte der Besitzer ein Update mit fachspezifischen Bausteinen, Querverweisen, einer schnellen Suche, einer ruhigeren Startseite, Bildbeschriftung und einer Funktion «Ins Fachbuch übernehmen». Die Bewertung steht im Backlog (AJ-24–AJ-33). Grundsätze aus SPEC und AGENTS.md: Fachbuch = Sicht ohne Kopien, offline, einfache Bedienung, jeder Editor-Knoten mit fester Abbildung in Word und PDF, Prüfung im Hauptprozess.

## Entscheide

1. **Neue Knoten im gemeinsamen Schema** (`src/shared/editor-schema.ts`): `callout` (Art merke/achtung/tipp), `taskList`/`taskItem` (Tiptap, nicht verschachtelt), `calculation` mit genau vier `calcLine` (given/formula/steps/result), Mark `merkstelle` (ID + Fachbegriff), Attribut `annotations` am Bild. `validateSections` prüft zusätzlich Arten, die Zeilenfolge im Rechenblock, Merkstellen-IDs und die Bildbeschriftung (Zod-Schema).
2. **Datenformat v7 ohne Tabellenänderung.** Die neuen Inhalte stehen im Journal-JSON. Die höhere Version schützt Projekte vor älteren Programmen (portable EXE ohne Update), die die Knoten nicht kennen und beim Speichern verwerfen würden. Die Migration ist leer; davor entsteht wie immer eine Sicherung «vor-update».
3. **Rechenblock ohne LaTeX.** Lernende schreiben Formeln als Text mit den Fachsymbolen. LaTeX bräuchte eine zusätzliche Bibliothek und wäre im Word-Export nur als Bild oder mit aufwendiger OMML-Umwandlung möglich.
4. **Querverweise nutzen Links.** `[[` öffnet eine Auswahl (Journale, Schlagwörter, Merkstellen). Journale und Merkstellen werden zu Journal-Links (mit «Erwähnt in»), Schlagwörter zu `lernjournal://tag/<uuid>` (Strg+Klick → Themenansicht). Fertig getipptes `[[Begriff]]` wird nur bei genauem Treffer zum Link. Umgesetzt in `handleTextInput` des Editors.
5. **«Ins Fachbuch übernehmen» als Merkstelle.** Eine bereinigte Kopie als Wiki-Artikel widerspräche «keine Duplikate» und entspricht den eigenständigen Wissensseiten (P2). Eine Merkstelle markiert Text im Journal mit Fachbegriff; das Fachbuch liest alle Merkstellen bei jeder Abfrage frisch aus den Journalen (`MerkstellenService`, ohne eigene Tabelle) und springt zur Stelle zurück.
6. **Bildbeschriftung nicht destruktiv.** Formen relativ zur Bildgrösse im Bild-Knoten, eine SVG-Darstellung (`annotationSvg`) für Editor, PDF und Word. Für Word rechnet ein verborgenes, abgeschottetes Fenster (wie bei der WebP-Umwandlung, ohne Preload und IPC) Foto und SVG zu einem Bild zusammen. Bedienbar mit Maus und Tastatur (Liste der Formen, Pfeiltasten verschieben).
7. **Schnellsuche ohne neuen Index.** Strg+K kombiniert die Journalliste im Renderer mit dem bestehenden FTS5-Index.
8. **Filter zentral.** Der Filter der Journalliste liegt im App-Zustand, damit das Menüband ausserhalb des Editors dieselben Filter bedienen kann.

## Folgen

- Neue Knoten brauchen immer: Schema + Prüfung, Klartext (`plainTextOf`), Suchprojektion, DOCX, PDF, Tests (`src/main/export/blocks-export.test.ts`) und ENTWICKLUNG.md.
- Projekte mit Datenformat v7 lassen sich nur mit dieser oder einer neueren Version öffnen; `.ajournal` und Sicherungen tragen die Version mit.
- Merkstellen in archivierten Journalen erscheinen nur mit «Archivierte einbeziehen».

## Nachtrag 25.11.2026 – Menüband einzeilig

Mit den neuen Befehlen brach das Register «Einfügen» auf zwei Zeilen um und schob die Dokumentfläche nach unten. Entscheid nach dem Vorbild des vereinfachten Office-Menübands: Verwandte Bausteine stehen in einem Aufklapp-Menü «Bausteine». Die Befehlszeile misst ihre Gruppen (unsichtbare Kopien mit und ohne Beschriftung, `ResizeObserver`) und verteilt den Platz mit `fitRibbon` (`ribbon-layout.ts`): erst Beschriftungen von rechts weg, dann Gruppen in «Weitere Befehle». Menüs liegen in einem Portal, damit die Leiste sie nicht abschneidet; nach einer Auswahl geht der Fokus sofort in den Editor zurück.

