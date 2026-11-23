// Volltextsuche im Fachbuch (SPEC «Suche»): Titel, Text aller Abschnitte,
// Bildlegenden und Schlagwörter; unabhängig von Gross-/Kleinschreibung und
// Akzenten (FTS5-Tokenizer unicode61 remove_diacritics 2, ADR 0001).
//
// Trefferausschnitte werden mit Steuerzeichen \u0002 … \u0003 markiert (nicht
// mit HTML), damit die Oberfläche sie sicher hervorheben kann, ohne fremdes
// HTML einzuschleusen.
import type { Db } from '../db/connection';
import { ftsPrefixQuery } from '../links/link-service';

export const HL_START = '\u0002';
export const HL_END = '\u0003';

export type SearchResult = {
  id: string;
  title: string; // mit Markierungen
  snippet: string; // mit Markierungen
  workDate: string;
  status: 'draft' | 'completed' | 'archived';
};

export class SearchService {
  constructor(
    private readonly getDb: () => Db,
    private readonly resyncAll: () => number,
  ) {}

  private get db() {
    return this.getDb();
  }

  search(query: string, options: { includeArchived?: boolean; limit?: number } = {}): SearchResult[] {
    const fts = ftsPrefixQuery(query);
    if (!fts) return [];
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    const archived = options.includeArchived ? '' : "AND j.status <> 'archived'";
    return this.db
      .prepare(
        `SELECT j.id,
                highlight(journal_fts, 1, ?, ?) AS title,
                snippet(journal_fts, 2, ?, ?, '…', 16) AS snippet,
                j.work_date AS workDate, j.status
         FROM journal_fts JOIN journal j ON j.id = journal_fts.journal_id
         WHERE journal_fts MATCH ? ${archived}
         ORDER BY bm25(journal_fts, 0, 5.0, 1.0), j.work_date DESC
         LIMIT ?`,
      )
      .all(HL_START, HL_END, HL_START, HL_END, fts, limit) as SearchResult[];
  }

  // Ist der Index vollständig? (eine Zeile pro Journal)
  isIndexComplete(): boolean {
    const { j } = this.db.prepare('SELECT count(*) AS j FROM journal').get() as { j: number };
    const { f } = this.db.prepare('SELECT count(DISTINCT journal_id) AS f FROM journal_fts').get() as {
      f: number;
    };
    const { orphan } = this.db
      .prepare('SELECT count(*) AS orphan FROM journal_fts WHERE journal_id NOT IN (SELECT id FROM journal)')
      .get() as { orphan: number };
    return j === f && orphan === 0;
  }

  // Index komplett aus den Journalen neu aufbauen (SPEC: «Index rekonstruierbar»)
  rebuild(): number {
    return this.resyncAll();
  }
}
