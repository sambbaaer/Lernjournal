# ADR 0004 – Volltextsuche und Fachbuch

- **Status:** angenommen (AJ-11, 2026-11-23)

## Kontext
SPEC verlangt eine Volltextsuche über Titel, Text, Bildlegenden und Tags, unabhängig von Gross-/Kleinschreibung und Umlauten, mit rekonstruierbarem Index (Befehl «Suchindex neu aufbauen»). Lernende sollen während der IPA schnell nachschlagen können (R-16) – ohne Abfragesprache lernen zu müssen. Schema v1 hatte `journal_fts(journal_id, title, body)` mit Tokenizer `unicode61 remove_diacritics 2`: Legenden steckten im Text, Schlagwörter fehlten, und es wurden nur ganze Wörter bzw. Wortanfänge gefunden.

Deutsche Fachbegriffe sind oft zusammengesetzt (Farbmessung, Druckmaschine, Plattenzylinder). Wer «Messung» oder «Maschine» sucht, erwartet diese Journale – so wie Strg+F in Word Wortteile findet.

## Entscheid
- **Index:** Migration v2 ersetzt `journal_fts` durch `journal_id UNINDEXED, title, body, captions, tags, categories` mit Tokenizer **`trigram remove_diacritics 1`** (FTS5, ab SQLite 3.45; Electron 45 bringt 3.54) und füllt ihn aus den bestehenden Journalen. Trigramme finden Wortteile; Gross/Klein und Akzente sind egal. Getrennte Spalten erlauben die Angabe «Gefunden in: Bildlegende» und eine Gewichtung (bm25: Titel 10, Schlagwort 5, Kategorie 3, Legende 2, Text 1). Kategorien sind zusätzlich zu SPEC durchsuchbar, weil sie für Lernende Themen sind.
- **Aktualität:** Jede Änderung (Titel, Inhalt, Zuordnung, Umbenennen/Zusammenführen/Löschen von Kategorien und Schlagwörtern, Löschen eines Journals) schreibt die Indexzeilen der betroffenen Journale in derselben Transaktion neu (`SearchIndex`). Beim Öffnen prüft `ensureComplete()` Vollständigkeit, verwaiste/doppelte Zeilen und die FTS5-`integrity-check`; bei Abweichung Neuaufbau.
- **Neuaufbau:** `DROP` + `CREATE` + Füllen in einer Transaktion – hilft auch bei beschädigten Indexdaten; schlägt er fehl, bleibt der alte Index.
- **Abfrage:** Der Renderer schickt nur freien Text (max. 200 Zeichen). Der Hauptprozess zerlegt ihn in Wörter (Buchstaben/Ziffern), nimmt die mit mindestens 3 Zeichen (max. 8), setzt jedes in Anführungszeichen und verbindet sie mit `AND`. Schreibvarianten (ae/oe/ue ↔ ä/ö/ü, ss ↔ ß) werden als `OR`-Alternativen ergänzt. FTS5-Schlüsselwörter und Sonderzeichen der Eingabe bleiben so wirkungslos.
- **Trefferanzeige:** `highlight()`/`snippet()` (64 Zeichen) markieren mit den Steuerzeichen U+0002/U+0003 statt HTML; der Renderer baut daraus `<mark>`-Elemente. Diese Zeichen werden vor dem Indexieren aus dem Text entfernt. Angeschnittene Wörter am Rand eines Ausschnitts werden entfernt (`tidySnippet`).
- **Fachbuch-Sicht:** Themen = Kategorien, Schlagwörter, «Ohne Kategorie» und «Verwandte Schlagwörter» berechnet der Renderer aus der bereits geladenen Journalliste; mit Suchbegriff werden die Treffer auf das gewählte Thema eingeschränkt. Keine zusätzlichen Tabellen, keine Kopien.

## Verworfen
- **`unicode61` mit Präfixsuche** (ursprünglicher SPEC-Vorschlag): bessere Ausschnitte und auch 1–2-Zeichen-Wörter, aber «Messung» findet «Farbmessung» nicht – bei deutschen Komposita ein häufiger Fehlschlag.
- **Zwei Indizes (Wörter + Trigramme):** doppelter Pflegeaufwand für einen kleinen Gewinn bei sehr kurzen Begriffen.
- **Umlaute im Index umschreiben** (ü → ue): würde Ausschnitte verfälschen; Varianten in der Abfrage sind gleichwertig und einfacher.
- **FTS5-Abfragesprache für Nutzende freigeben:** Syntaxfehler bei alltäglichen Eingaben («Farbe (CMYK»), kein Nutzen für die Zielgruppe.
- **Externer Inhalt (`content=journal`):** Die Projektion (Tiptap-JSON → Klartext, Zuordnungen) entsteht in JavaScript, nicht in SQL; ein eigenständiger Index ist einfacher und jederzeit neu aufbaubar.

## Konsequenzen
- Begriffe unter 3 Zeichen («UV», «3D») sind allein nicht suchbar; die Oberfläche sagt «Suchbegriffe ab 3 Zeichen eingeben». In längeren Eingaben («UV-Lack») wird nach den übrigen Wörtern gesucht.
- Treffer werden genau im gefundenen Teil markiert («Farb**messung**»).
- Der Trigramm-Index ist grösser als ein Wortindex – bei einigen hundert Journalen unerheblich.
- Neue durchsuchbare Felder brauchen eine Migration (neue Spalten) und eine Anpassung von `projection.ts`/`search-index.ts`; `CURRENT_FTS_DDL` zeigt dann auf die neue Definition.
- Wer Journale oder Zuordnungen ändert, muss den Suchindex in derselben Transaktion nachführen (`SearchIndex.sync`/`syncMany`).
