# ADR 0008 – Journalvorlagen und Windows-Titelleiste

**Status** angenommen am 24.11.2026.

## Journalvorlagen

Die Speicherung der Abschnitte wurde mit Schema v5 abgelöst. [ADR 0009](0009-freie-abschnitte-und-journalkopf.md)

Beim Anlegen erhält jeder Eintrag eine Vorlagen-ID. Schema v4 setzt diese bei bestehenden Journalen auf `report`. Die Abschnitte bleiben Tiptap-Dokumente mit den stabilen Schlüsseln aus dem bisherigen Schema. Die Vorlagen steuern die sichtbaren Überschriften und den Startinhalt. Maschinenwerte sind eine Rich-Text-Tabelle, Arbeitsschritte eine Rich-Text-Liste. Beide lassen sich mit den vorhandenen Werkzeugen bearbeiten und durchsuchen.

Renderer und DOCX teilen sich die Reihenfolge und Überschriften aus `journal-templates.ts`. Der freie Eintrag benutzt einen Abschnitt ohne Überschrift. Hauptprozess und Archivprüfung verlangen leere Speicherplätze für die übrigen Abschnitte. Vorlagen werden mit dem Journal dupliziert und über dieselbe Datenbank in Projektübergaben und Sicherungen transportiert.

## Windows-Titelleiste und Symbole

Electron stellt über `titleBarOverlay` die nativen Fensterknöpfe bereit. Der Renderer zeichnet den Titel in den vom Overlay gelieferten Bereich und kennzeichnet ihn als Ziehfläche. Im Kontrastdesign kommen für Text und Fensterknöpfe Windows-Systemfarben zum Einsatz. Die minimale Fenstergrösse beträgt 760 × 480 logische Pixel. An Systemen ohne das Windows-Overlay bleibt der Standardrahmen sichtbar.

Die Vektorquellen in `assets/` werden in der Oberfläche verwendet. `npm run icon` erzeugt das App-ICO, das Symbol für das Fenster und das separate Datei-ICO. Die Dateizuordnung für das Explorer-Symbol ist ein eigenes Arbeitspaket.
