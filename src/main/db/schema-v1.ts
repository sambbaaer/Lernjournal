// Schema Version 1 – P0-Tabellen aus SPEC «Logisches Schema».
//
// Grundsätze:
//  - Regeln, die IMMER gelten müssen, stehen als Constraint in der Datenbank
//    (nicht nur im App-Code). So bleiben die Daten auch bei Programmfehlern
//    oder nach einem Import gültig.
//  - Zeitstempel: ISO-8601 in UTC als Text («2026-11-23T17:30:00.000Z»).
//  - Arbeitsdatum: lokales ISO-Datum («2026-03-14»).
//  - IDs: UUID als Text (stabil über Export/Import hinweg).
//
// WICHTIG: Diese Datei nach Veröffentlichung nie mehr ändern. Änderungen
// kommen als neue Migration (schema-v2.ts …), sonst passen bestehende
// Projektdateien nicht mehr zum Code.

export const SCHEMA_V1 = /* sql */ `
-- Projekt: genau eine Zeile pro Datenbank
CREATE TABLE project (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  created_at TEXT NOT NULL,
  created_with_app_version TEXT NOT NULL
);

-- Profil der lernenden Person: genau eine Zeile
CREATE TABLE profile (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  display_name TEXT NOT NULL DEFAULT '',
  company TEXT,
  apprenticeship_start TEXT CHECK (apprenticeship_start IS NULL OR date(apprenticeship_start) IS apprenticeship_start),
  specialization TEXT NOT NULL DEFAULT 'print'
    CHECK (specialization IN ('print', 'printmediatechnik', 'siebdruck'))
);

CREATE TABLE journal (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  -- «IS» statt «=»: date() liefert bei ungültigem Format NULL, und ein CHECK mit
  -- NULL gälte sonst als erfüllt. «2026-02-30» wird zu «2026-03-02» → abgelehnt.
  work_date TEXT NOT NULL CHECK (date(work_date) IS work_date),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'completed', 'archived')),
  learning_place TEXT NOT NULL DEFAULT 'betrieb' CHECK (learning_place IN ('betrieb', 'uek', 'schule')),
  school_year_override INTEGER CHECK (school_year_override IS NULL OR school_year_override BETWEEN 1 AND 4),
  -- Auftrag/Durchführung/Reflexion als Tiptap-JSON
  sections_json TEXT NOT NULL CHECK (json_valid(sections_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  -- «Abgeschlossen» braucht ein Abschlussdatum
  CHECK (status <> 'completed' OR completed_at IS NOT NULL)
);
CREATE INDEX journal_work_date ON journal (work_date);
CREATE INDEX journal_status ON journal (status);
CREATE INDEX journal_updated ON journal (updated_at);

-- Kategorien (Vorschlag: Handlungskompetenzbereiche a–g) und Schlagwörter.
-- Namen eindeutig ohne Rücksicht auf Gross-/Kleinschreibung.
CREATE TABLE category (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(name)) > 0),
  source TEXT NOT NULL DEFAULT 'user' CHECK (source IN ('bipla', 'user')),
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE journal_category (
  journal_id TEXT NOT NULL REFERENCES journal (id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES category (id) ON DELETE CASCADE,
  PRIMARY KEY (journal_id, category_id)
) WITHOUT ROWID;
CREATE INDEX journal_category_by_category ON journal_category (category_id);

CREATE TABLE tag (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(name)) > 0)
);
CREATE TABLE journal_tag (
  journal_id TEXT NOT NULL REFERENCES journal (id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tag (id) ON DELETE CASCADE,
  PRIMARY KEY (journal_id, tag_id)
) WITHOUT ROWID;
CREATE INDEX journal_tag_by_tag ON journal_tag (tag_id);

-- Verknüpfungen zwischen Journalen. Gespeichert in einer Richtung, angezeigt
-- in beiden. Keine Selbstlinks, und A→B verbietet zusätzlich B→A (sonst wäre
-- dieselbe Beziehung doppelt vorhanden).
CREATE TABLE journal_link (
  source_journal_id TEXT NOT NULL REFERENCES journal (id) ON DELETE CASCADE,
  target_journal_id TEXT NOT NULL REFERENCES journal (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (source_journal_id, target_journal_id),
  CHECK (source_journal_id <> target_journal_id)
) WITHOUT ROWID;
CREATE UNIQUE INDEX journal_link_undirected
  ON journal_link (min(source_journal_id, target_journal_id), max(source_journal_id, target_journal_id));
CREATE INDEX journal_link_by_target ON journal_link (target_journal_id);

-- Bilder: Datei liegt unter media/<uuid>.<ext>, hier nur Verweis + Metadaten
CREATE TABLE media (
  id TEXT PRIMARY KEY,
  journal_id TEXT NOT NULL REFERENCES journal (id) ON DELETE CASCADE,
  relative_path TEXT NOT NULL UNIQUE
    CHECK (relative_path LIKE 'media/%' AND relative_path NOT LIKE '%..%' AND relative_path NOT LIKE '%\\%'),
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  caption TEXT NOT NULL DEFAULT '',
  width INTEGER NOT NULL CHECK (width > 0),
  height INTEGER NOT NULL CHECK (height > 0),
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  created_at TEXT NOT NULL
);
CREATE INDEX media_by_journal ON media (journal_id);

-- Suchindex (abgeleitet, jederzeit aus den Journalen neu aufbaubar).
-- Tokenizer ignoriert Gross-/Kleinschreibung und Akzente (ADR 0001).
CREATE VIRTUAL TABLE journal_fts USING fts5 (
  journal_id UNINDEXED,
  title,
  body,
  tokenize = 'unicode61 remove_diacritics 2'
);
`;
