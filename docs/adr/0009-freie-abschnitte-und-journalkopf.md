# ADR 0009 – Frei gestaltbare Abschnitte und kompakter Journalkopf

**Status** angenommen am 24.11.2026.

## Abschnitte

Die Vorlage initialisiert ein Journal. Danach bestimmt eine geordnete Liste aus stabiler Abschnitts-ID, optionaler Überschrift und Tiptap-Dokument seine Struktur. Schema v5 migriert bestehende Journale in ihrer bisherigen Anzeigereihenfolge. Die Projektöffnung sichert ältere Datenbanken vor der Migration. Die SQLite-Spalte `sections_json` bleibt bestehen. Der neu aufgebaute Suchindex berücksichtigt eigene Abschnittsüberschriften.

Bearbeitung, Suche, Bildverweise, Projektübergabe und Word-Ausgabe lesen die gespeicherte Liste. Das Journal behält seine Ausgangsvorlage als Metadatum. Bestätigung beim Entfernen eines Abschnitts schützt dessen Inhalt. Bilder werden über die vorhandene Medienverwaltung bereinigt.

## Editoroberfläche

Der Journalkopf zeigt die Angaben für die Orientierung kompakt an. Der aufklappbare Bereich enthält die editierbaren Metadaten und Zuordnungen. Befehle des Journalregisters öffnen ihn und fokussieren das passende Feld.

Das Menüband übernimmt die Unterscheidung zwischen Zwischenablage im Register «Start» («Einfügen» und «Nur Text») und dem Einfügen neuer Inhalte im Register «Einfügen». Am Ende der Journalseite steht neben «Abschnitt hinzufügen» ein direkter «Einfügen»-Knopf mit denselben Optionen (Zwischenablage, Nur Text übernehmen, Bild aus Datei, Tabelle), ergänzt durch ein natives Windows-Rechtsklick-Kontextmenü im Editor. Der Zwischenablage-Befehl löst im fokussierten Fenster den nativen Paste-Event (`paste` bzw. `pasteAndMatchStyle`) aus und nutzt die bestehende Bereinigung von Rich Text und Bildern. Der IPC-Aufruf liefert ein Ergebnis zur Ausführung und die Sandbox erhält dadurch keine allgemeine Schnittstelle zur Zwischenablage.
