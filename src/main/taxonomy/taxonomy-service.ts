// Kategorien und Schlagwörter (SPEC: «Mehrere Kategorien und Tags», R-05).
//
// - Kategorien: feste Ordnung (Vorschlag: Handlungskompetenzbereiche a–g),
//   bleiben bestehen, auch wenn (noch) kein Journal zugeordnet ist.
// - Schlagwörter: entstehen beim Tippen im Journal; ein Schlagwort ohne
//   Journal wird automatisch entfernt (Einfachheit vor Vollständigkeit).
// - Alle Zuordnungen sind freiwillig. Namen sind eindeutig ohne Rücksicht auf
//   Gross-/Kleinschreibung (Schema: COLLATE NOCASE UNIQUE).
import { randomUUID } from 'node:crypto';
import { transaction, type Db } from '../db/connection';

export type Kind = 'category' | 'tag';
export type CategoryInfo = {
  id: string;
  name: string;
  source: 'bipla' | 'user';
  sortOrder: number;
  count: number;
};
export type TagInfo = { id: string; name: string; count: number };

export class TaxonomyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TaxonomyError';
  }
}

const TABLE = { category: 'category', tag: 'tag' } as const;
const LINK = {
  category: { table: 'journal_category', col: 'category_id' },
  tag: { table: 'journal_tag', col: 'tag_id' },
} as const;

export function cleanName(name: string): string {
  const n = name.replace(/\s+/g, ' ').trim();
  if (!n) throw new TaxonomyError('Der Name darf nicht leer sein.');
  if (n.length > 80) throw new TaxonomyError('Der Name ist zu lang (höchstens 80 Zeichen).');
  return n;
}

export class TaxonomyService {
  // onJournalsChanged: Suchindex der betroffenen Journale neu schreiben (Schlagwörter sind durchsuchbar)
  constructor(
    private readonly getDb: () => Db,
    private readonly onJournalsChanged: (journalIds: string[]) => void = () => {},
  ) {}

  private get db() {
    return this.getDb();
  }

  list(): { categories: CategoryInfo[]; tags: TagInfo[] } {
    const categories = this.db
      .prepare(
        `SELECT c.id, c.name, c.source, c.sort_order AS sortOrder,
                (SELECT count(*) FROM journal_category jc WHERE jc.category_id = c.id) AS count
         FROM category c ORDER BY c.sort_order, c.name COLLATE NOCASE`,
      )
      .all() as CategoryInfo[];
    const tags = this.db
      .prepare(
        `SELECT t.id, t.name, (SELECT count(*) FROM journal_tag jt WHERE jt.tag_id = t.id) AS count
         FROM tag t ORDER BY t.name COLLATE NOCASE`,
      )
      .all() as TagInfo[];
    return { categories, tags };
  }

  private findByName(kind: Kind, name: string): { id: string; name: string } | undefined {
    return this.db.prepare(`SELECT id, name FROM ${TABLE[kind]} WHERE name = ? COLLATE NOCASE`).get(name) as
      { id: string; name: string } | undefined;
  }

  private exists(kind: Kind, id: string): void {
    if (!this.db.prepare(`SELECT 1 FROM ${TABLE[kind]} WHERE id = ?`).get(id)) {
      throw new TaxonomyError(
        kind === 'category' ? 'Kategorie nicht gefunden.' : 'Schlagwort nicht gefunden.',
      );
    }
  }

  private journalsOf(kind: Kind, id: string): string[] {
    const l = LINK[kind];
    return (
      this.db.prepare(`SELECT journal_id FROM ${l.table} WHERE ${l.col} = ?`).all(id) as {
        journal_id: string;
      }[]
    ).map((r) => r.journal_id);
  }

  // Neue Kategorie/neues Schlagwort; gibt es den Namen schon, wird der bestehende Eintrag geliefert.
  create(kind: Kind, rawName: string): { id: string; name: string } {
    const name = cleanName(rawName);
    const existing = this.findByName(kind, name);
    if (existing) return existing;
    const id = randomUUID();
    if (kind === 'category') {
      const { m } = this.db.prepare('SELECT coalesce(max(sort_order), -1) + 1 AS m FROM category').get() as {
        m: number;
      };
      this.db
        .prepare("INSERT INTO category (id, name, source, sort_order) VALUES (?, ?, 'user', ?)")
        .run(id, name, m);
    } else {
      this.db.prepare('INSERT INTO tag (id, name) VALUES (?, ?)').run(id, name);
    }
    return { id, name };
  }

  rename(kind: Kind, id: string, rawName: string): void {
    const name = cleanName(rawName);
    this.exists(kind, id);
    const clash = this.findByName(kind, name);
    if (clash && clash.id !== id) {
      throw new TaxonomyError(`«${clash.name}» gibt es schon. Zum Vereinen «Zusammenführen» verwenden.`);
    }
    this.db.prepare(`UPDATE ${TABLE[kind]} SET name = ? WHERE id = ?`).run(name, id);
    if (kind === 'tag') this.onJournalsChanged(this.journalsOf(kind, id));
  }

  // Zusammenführen: alle Journale von «source» bekommen «target»; «source» verschwindet.
  merge(kind: Kind, sourceId: string, targetId: string): void {
    if (sourceId === targetId) throw new TaxonomyError('Bitte zwei verschiedene Einträge wählen.');
    this.exists(kind, sourceId);
    this.exists(kind, targetId);
    const l = LINK[kind];
    const affected = this.journalsOf(kind, sourceId);
    transaction(this.db, () => {
      // INSERT OR IGNORE: Journale, die beide schon hatten, bekommen keine Doppelzuordnung
      this.db
        .prepare(
          `INSERT OR IGNORE INTO ${l.table} (journal_id, ${l.col}) SELECT journal_id, ? FROM ${l.table} WHERE ${l.col} = ?`,
        )
        .run(targetId, sourceId);
      this.db.prepare(`DELETE FROM ${TABLE[kind]} WHERE id = ?`).run(sourceId); // Cascade entfernt alte Zuordnungen
    });
    if (kind === 'tag') this.onJournalsChanged(affected);
  }

  delete(kind: Kind, id: string): void {
    this.exists(kind, id);
    const affected = this.journalsOf(kind, id);
    this.db.prepare(`DELETE FROM ${TABLE[kind]} WHERE id = ?`).run(id);
    if (kind === 'tag') this.onJournalsChanged(affected);
  }

  setJournalCategories(journalId: string, categoryIds: string[]): void {
    const unique = [...new Set(categoryIds)];
    transaction(this.db, () => {
      this.db.prepare('DELETE FROM journal_category WHERE journal_id = ?').run(journalId);
      const insert = this.db.prepare('INSERT INTO journal_category (journal_id, category_id) VALUES (?, ?)');
      for (const id of unique) insert.run(journalId, id); // Fremdschlüssel prüft, dass es die Kategorie gibt
    });
  }

  // Schlagwörter per Namen: fehlende werden angelegt, nicht mehr verwendete entfernt.
  setJournalTags(journalId: string, names: string[]): void {
    const cleaned: string[] = [];
    for (const n of names) {
      const c = cleanName(n);
      if (!cleaned.some((x) => x.toLowerCase() === c.toLowerCase())) cleaned.push(c);
    }
    if (cleaned.length > 30) throw new TaxonomyError('Höchstens 30 Schlagwörter pro Journal.');
    transaction(this.db, () => {
      this.db.prepare('DELETE FROM journal_tag WHERE journal_id = ?').run(journalId);
      const insert = this.db.prepare('INSERT INTO journal_tag (journal_id, tag_id) VALUES (?, ?)');
      for (const name of cleaned) insert.run(journalId, this.create('tag', name).id);
      this.removeUnusedTags();
    });
    this.onJournalsChanged([journalId]);
  }

  removeUnusedTags(): number {
    return Number(
      this.db.prepare('DELETE FROM tag WHERE id NOT IN (SELECT tag_id FROM journal_tag)').run().changes,
    );
  }
}
