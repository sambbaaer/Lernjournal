// Verknüpfungen zwischen Journalen (SPEC: «Links in beide Richtungen anzeigen»,
// «Fachbuch speichert keine Kopien»).
//
// Eine Beziehung A–B wird EINMAL gespeichert (Tabelle journal_link) und in
// beiden Journalen angezeigt: in A als «verweist auf B», in B als Rückverweis.
// Das Schema verhindert Selbstlinks und doppelte Beziehungen (auch B→A).
import type { Db } from '../db/connection';

export type LinkedJournal = {
  journalId: string;
  title: string;
  workDate: string;
  status: 'draft' | 'completed' | 'archived';
  direction: 'outgoing' | 'incoming';
};

export class LinkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LinkError';
  }
}

// Suchbegriffe sicher für FTS5 aufbereiten: nur Wörter, je als Präfix («farb*»).
// Anführungszeichen und FTS-Operatoren aus der Eingabe werden entfernt.
export function ftsPrefixQuery(input: string): string | null {
  const words = input
    .normalize('NFC')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 0)
    .slice(0, 8);
  if (words.length === 0) return null;
  return words.map((w) => `"${w}"*`).join(' ');
}

export class LinkService {
  constructor(
    private readonly getDb: () => Db,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private get db() {
    return this.getDb();
  }

  private requireJournal(id: string): void {
    if (!this.db.prepare('SELECT 1 FROM journal WHERE id = ?').get(id))
      throw new LinkError('Journal nicht gefunden.');
  }

  list(journalId: string): LinkedJournal[] {
    return this.db
      .prepare(
        `SELECT j.id AS journalId, j.title, j.work_date AS workDate, j.status, 'outgoing' AS direction
           FROM journal_link l JOIN journal j ON j.id = l.target_journal_id WHERE l.source_journal_id = ?
         UNION ALL
         SELECT j.id, j.title, j.work_date, j.status, 'incoming'
           FROM journal_link l JOIN journal j ON j.id = l.source_journal_id WHERE l.target_journal_id = ?
         ORDER BY workDate DESC`,
      )
      .all(journalId, journalId) as LinkedJournal[];
  }

  // Verknüpfen. Besteht die Beziehung schon (in welcher Richtung auch immer): nichts tun.
  add(sourceId: string, targetId: string): void {
    if (sourceId === targetId)
      throw new LinkError('Ein Journal kann nicht mit sich selbst verknüpft werden.');
    this.requireJournal(sourceId);
    this.requireJournal(targetId);
    const exists = this.db
      .prepare(
        `SELECT 1 FROM journal_link WHERE (source_journal_id = ? AND target_journal_id = ?)
                                       OR (source_journal_id = ? AND target_journal_id = ?)`,
      )
      .get(sourceId, targetId, targetId, sourceId);
    if (exists) return;
    this.db
      .prepare('INSERT INTO journal_link (source_journal_id, target_journal_id, created_at) VALUES (?, ?, ?)')
      .run(sourceId, targetId, this.now().toISOString());
  }

  // Entfernt die Beziehung, egal in welcher Richtung sie gespeichert ist.
  remove(a: string, b: string): void {
    this.db
      .prepare(
        `DELETE FROM journal_link WHERE (source_journal_id = ? AND target_journal_id = ?)
                                     OR (source_journal_id = ? AND target_journal_id = ?)`,
      )
      .run(a, b, b, a);
  }

  // Journale suchen (Titel, Text, Legenden, Schlagwörter) für die Auswahl beim Verknüpfen.
  // Ohne Suchbegriff: zuletzt geänderte Journale.
  search(
    query: string,
    options: { excludeId?: string; limit?: number } = {},
  ): { id: string; title: string; workDate: string; status: string }[] {
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);
    const exclude = options.excludeId ?? '';
    const fts = ftsPrefixQuery(query);
    if (!fts) {
      return this.db
        .prepare(
          `SELECT id, title, work_date AS workDate, status FROM journal
           WHERE id <> ? AND status <> 'archived' ORDER BY updated_at DESC LIMIT ?`,
        )
        .all(exclude, limit) as { id: string; title: string; workDate: string; status: string }[];
    }
    return this.db
      .prepare(
        `SELECT j.id, j.title, j.work_date AS workDate, j.status
         FROM journal_fts f JOIN journal j ON j.id = f.journal_id
         WHERE journal_fts MATCH ? AND j.id <> ?
         ORDER BY (j.status = 'archived'), bm25(journal_fts, 0, 5.0, 1.0) LIMIT ?`,
      )
      .all(fts, exclude, limit) as { id: string; title: string; workDate: string; status: string }[];
  }
}
