// Suchindex (AJ-11): hält journal_fts aktuell, baut ihn neu auf und sucht.
//
// Grundsätze:
//  - Der Index ist abgeleitet. Jede Änderung an einem Journal, seinen
//    Schlagwörtern oder Kategorien schreibt dessen Indexzeile neu – in
//    DERSELBEN Transaktion wie die Änderung (alles oder nichts).
//  - Geht trotzdem etwas schief (Programmfehler, Absturz, Import), lässt sich
//    der Index jederzeit aus den Journalen neu aufbauen: automatisch beim
//    Öffnen, wenn er unvollständig ist, oder per Knopf in den Einstellungen.
//  - Gesucht wird nur im Hauptprozess; die Oberfläche bekommt fertige Treffer.
import { MARK_END, MARK_START, type SearchField, type SearchHit, type SearchResult } from '@shared/search';
import type { LegacySections, Sections } from '@shared/journal';
import { transaction, type Db } from '../db/connection';
import { SCHEMA_V2 } from '../db/schema-v2';
import { buildFtsQuery } from './fts-query';
import { cleanIndexText, projectSections, type SearchProjection } from './projection';

// Aktuelle Form der Indextabelle (DROP + CREATE). Ändert eine spätere
// Migration den Index, zeigt diese Konstante auf deren DDL.
const CURRENT_FTS_DDL = SCHEMA_V2;

// Gewichte je Spalte für bm25() in Spaltenreihenfolge (journal_id, title,
// body, captions, tags, categories). Ein Treffer im Titel zählt zehnmal so
// viel wie einer im Fliesstext; journal_id ist nicht durchsuchbar.
const BM25_WEIGHTS = '0, 10, 1, 2, 5, 3';

// Mehr Treffer zeigt die Oberfläche nicht an (bei einigen hundert Journalen
// über vier Lehrjahre selten erreicht; schützt vor riesigen Antworten)
export const MAX_HITS = 200;

// Länge der Textausschnitte. Beim Trigramm-Index zählt jedes Zeichen als
// «Token»: 64 (Maximum von FTS5) ergibt rund eine Zeile Text.
const SNIPPET_TOKENS = 64;

// Projektion eines Journals aus der Datenbank (Titel, Inhalt, Zuordnungen)
function readProjection(db: Db, journalId: string): SearchProjection | null {
  const r = db.prepare('SELECT title, sections_json FROM journal WHERE id = ?').get(journalId) as
    { title: string; sections_json: string } | undefined;
  if (!r) return null;
  const names = (sql: string) =>
    (db.prepare(sql).all(journalId) as { name: string }[]).map((x) => x.name).join('\n');
  const { body, captions } = projectSections(JSON.parse(r.sections_json) as Sections | LegacySections);
  return {
    title: cleanIndexText(r.title),
    body,
    captions,
    tags: cleanIndexText(
      names('SELECT t.name FROM journal_tag x JOIN tag t ON t.id = x.tag_id WHERE x.journal_id = ?'),
    ),
    categories: cleanIndexText(
      names(
        'SELECT c.name FROM journal_category x JOIN category c ON c.id = x.category_id WHERE x.journal_id = ?',
      ),
    ),
  };
}

// Indexzeile eines Journals neu schreiben (oder entfernen, wenn es das
// Journal nicht mehr gibt). Öffnet KEINE eigene Transaktion – der Aufrufer
// ruft das innerhalb seiner Änderung auf.
export function indexJournal(db: Db, journalId: string): void {
  db.prepare('DELETE FROM journal_fts WHERE journal_id = ?').run(journalId);
  const p = readProjection(db, journalId);
  if (!p) return;
  db.prepare(
    'INSERT INTO journal_fts (journal_id, title, body, captions, tags, categories) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(journalId, p.title, p.body, p.captions, p.tags, p.categories);
}

// Leeren Index mit allen Journalen füllen (Migration und Neuaufbau).
// Ebenfalls ohne eigene Transaktion. Liefert die Anzahl Journale.
export function fillSearchIndex(db: Db): number {
  const ids = (db.prepare('SELECT id FROM journal').all() as { id: string }[]).map((r) => r.id);
  for (const id of ids) indexJournal(db, id);
  return ids.length;
}

type HitRow = {
  id: string;
  title: string;
  body: string;
  captions: string;
  tags: string;
  categories: string;
};

const hasMark = (s: string) => s.includes(MARK_START);

// Ausschnitte schneiden Wörter am Rand ab («…ie Farbmessung mit dem S…»).
// Angeschnittene Wörter ohne Treffer am Anfang und Ende entfernen:
// «…Farbmessung mit dem …». Treffer selbst werden nie gekürzt.
// «Wortzeichen» = weder Leerraum noch Markierung (aus den Konstanten gebaut,
// damit keine Steuerzeichen wörtlich im Muster stehen)
const WORD_CHARS = `[^\\s${MARK_START}${MARK_END}]+`;
const SNIPPET_HEAD = new RegExp(`^…${WORD_CHARS}\\s+`, 'u');
const SNIPPET_TAIL = new RegExp(`\\s+${WORD_CHARS}…$`, 'u');

export function tidySnippet(text: string): string {
  let t = text;
  // Teilwort direkt nach «…» bis zum ersten Leerraum (ohne Markierung darin)
  const head = SNIPPET_HEAD.exec(t);
  if (head) t = `…${t.slice(head[0].length)}`;
  // Teilwort direkt vor «…» ab dem letzten Leerraum
  const tail = SNIPPET_TAIL.exec(t);
  if (tail) t = `${t.slice(0, tail.index)} …`;
  return t;
}

export class SearchIndex {
  constructor(private readonly getDb: () => Db) {}

  private get db() {
    return this.getDb();
  }

  // Nach einer Änderung (innerhalb der Transaktion des Aufrufers)
  sync(journalId: string): void {
    indexJournal(this.db, journalId);
  }

  syncMany(journalIds: Iterable<string>): void {
    for (const id of new Set(journalIds)) indexJournal(this.db, id);
  }

  remove(journalId: string): void {
    this.db.prepare('DELETE FROM journal_fts WHERE journal_id = ?').run(journalId);
  }

  // «Suchindex neu aufbauen»: Tabelle verwerfen und neu anlegen statt nur
  // leeren – so hilft der Befehl auch, wenn die Indexdaten selbst beschädigt
  // sind. In einer Transaktion: Schlägt etwas fehl, bleibt der alte Index.
  rebuild(): { journals: number } {
    const journals = transaction(this.db, () => {
      this.db.exec(CURRENT_FTS_DDL);
      return fillSearchIndex(this.db);
    });
    // Indexdaten zusammenlegen (kleiner, schneller); Fehler hier sind harmlos
    try {
      this.db.exec("INSERT INTO journal_fts (journal_fts) VALUES ('optimize')");
    } catch (err) {
      console.warn('[suche] optimize fehlgeschlagen:', err);
    }
    return { journals };
  }

  // Beim Öffnen eines Projekts: Fehlt ein Journal im Index, gibt es Zeilen zu
  // gelöschten Journalen oder meldet FTS5 einen inneren Fehler, wird der Index
  // neu aufgebaut. Liefert true, wenn neu aufgebaut wurde.
  ensureComplete(): boolean {
    let healthy: boolean;
    try {
      const count = (sql: string) => (this.db.prepare(sql).get() as { n: number }).n;
      const missing = count(
        'SELECT count(*) AS n FROM journal WHERE id NOT IN (SELECT journal_id FROM journal_fts)',
      );
      const orphaned = count(
        'SELECT count(*) AS n FROM journal_fts WHERE journal_id NOT IN (SELECT id FROM journal)',
      );
      const doubled = count('SELECT count(*) - count(DISTINCT journal_id) AS n FROM journal_fts');
      // Prüft, ob die inneren Indexstrukturen zum gespeicherten Text passen
      this.db.exec("INSERT INTO journal_fts (journal_fts) VALUES ('integrity-check')");
      healthy = missing === 0 && orphaned === 0 && doubled === 0;
    } catch {
      healthy = false;
    }
    if (healthy) return false;
    this.rebuild();
    return true;
  }

  // Volltextsuche. Archivierte Journale nur auf Wunsch. Beste Treffer zuerst.
  search(query: string, options: { includeArchived: boolean }): SearchResult {
    const match = buildFtsQuery(query);
    if (!match) return { hits: [], truncated: false };
    const m = (col: number) => `highlight(journal_fts, ${col}, char(2), char(3))`;
    const s = (col: number) => `snippet(journal_fts, ${col}, char(2), char(3), '…', ${SNIPPET_TOKENS})`;
    // Tabellenname statt Alias: MATCH, bm25() & Co. brauchen den Namen der FTS-Tabelle
    const rows = this.db
      .prepare(
        `SELECT journal_fts.journal_id AS id, ${m(1)} AS title, ${s(2)} AS body, ${s(3)} AS captions,
                ${m(4)} AS tags, ${m(5)} AS categories
         FROM journal_fts JOIN journal j ON j.id = journal_fts.journal_id
         WHERE journal_fts MATCH ? AND (? = 1 OR j.status <> 'archived')
         ORDER BY bm25(journal_fts, ${BM25_WEIGHTS}), j.work_date DESC
         LIMIT ?`,
      )
      .all(match, options.includeArchived ? 1 : 0, MAX_HITS + 1) as HitRow[];
    const hits = rows.slice(0, MAX_HITS).map(toHit);
    return { hits, truncated: rows.length > MAX_HITS };
  }
}

function toHit(r: HitRow): SearchHit {
  const matchedIn: SearchField[] = [];
  if (hasMark(r.title)) matchedIn.push('title');
  if (hasMark(r.body)) matchedIn.push('body');
  if (hasMark(r.captions)) matchedIn.push('captions');
  if (hasMark(r.tags)) matchedIn.push('tags');
  if (hasMark(r.categories)) matchedIn.push('categories');
  // Ausschnitt nur zeigen, wenn er einen Treffer enthält (sonst wäre es bloss
  // der Textanfang). Text vor Bildlegende.
  const snippet = hasMark(r.body)
    ? { field: 'body' as const, text: tidySnippet(r.body) }
    : hasMark(r.captions)
      ? { field: 'captions' as const, text: tidySnippet(r.captions) }
      : null;
  return { id: r.id, title: r.title, snippet, matchedIn };
}
