// Schema Version 2 (AJ-11): Suchindex mit eigenen Spalten für Bildlegenden,
// Schlagwörter und Kategorien, Trigramm-Tokenizer für Wortteile (ADR 0004).
//
// Schema v1 kannte nur «title» und «body» (Legenden steckten im Text,
// Schlagwörter fehlten). Der Index ist abgeleitet – er enthält keine Daten,
// die es nicht auch in den Journalen gibt. Darum ist der Umbau einfach:
// alte Tabelle weg, neue anlegen, aus den Journalen neu füllen (die Migration
// ruft dafür fillSearchIndex auf).
//
// Spaltenreihenfolge ist fest – bm25()-Gewichte, snippet() und highlight()
// sprechen die Spalten über ihre Nummer an (siehe search-index.ts).
//
// WICHTIG: Diese Datei nach Veröffentlichung nie mehr ändern (siehe schema-v1.ts).

export const JOURNAL_FTS_V2 = /* sql */ `
CREATE VIRTUAL TABLE journal_fts USING fts5 (
  journal_id UNINDEXED,
  title,
  body,
  captions,
  tags,
  categories,
  -- Trigramm: findet auch Wortteile («messung» in «Farbmessung») – wichtig bei
  -- deutschen Komposita. Gross/Klein und Akzente egal: «Möglichkeit» =
  -- «moglichkeit» (remove_diacritics für Trigramm ab SQLite 3.45, ADR 0004)
  tokenize = 'trigram remove_diacritics 1'
);
`;

export const SCHEMA_V2 = /* sql */ `
DROP TABLE IF EXISTS journal_fts;
${JOURNAL_FTS_V2}
`;
