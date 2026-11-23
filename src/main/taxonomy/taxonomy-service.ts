// Kategorien und Schlagwörter (AJ-09): anlegen, umbenennen, zusammenführen,
// löschen und Journalen zuordnen. Arbeitet auf den Tabellen aus Schema v1
// (category, journal_category, tag, journal_tag) – keine Migration nötig.
//
// Jede Änderung läuft in einer Transaktion und führt den Suchindex der
// betroffenen Journale nach (AJ-11: Schlagwörter und Kategorien sind
// durchsuchbar – auch ein umbenanntes Schlagwort). Die Datenbank sichert Eindeutigkeit
// und referenzielle Integrität ab (UNIQUE, Fremdschlüssel mit CASCADE); der
// Dienst prüft zusätzlich Namen ohne Rücksicht auf Umlaut-Gross/Klein und
// liefert verständliche Fehlermeldungen statt SQL-Fehlern.
import { randomUUID } from 'node:crypto';
import { BIPLA_CATEGORIES } from '@shared/bipla';
import { nameKey, type Category, type Tag, type Taxonomy, type TaxonomyKind } from '@shared/taxonomy';
import { transaction, type Db } from '../db/connection';
import { SearchIndex } from '../search/search-index';

// Fehler mit Meldung für die Oberfläche (ipc-handler gibt sie weiter)
export class TaxonomyError extends Error {
  override name = 'TaxonomyError';
}

// Tabellen je Art. Werte stammen nur aus dieser Konstante, nie vom Renderer –
// darum ist das Einsetzen in SQL-Text hier unbedenklich.
const TABLES = {
  category: { table: 'category', link: 'journal_category', fk: 'category_id', label: 'Kategorie' },
  tag: { table: 'tag', link: 'journal_tag', fk: 'tag_id', label: 'Schlagwort' },
} as const;

export class TaxonomyService {
  constructor(
    private readonly getDb: () => Db,
    private readonly now: () => Date = () => new Date(),
    private readonly search: SearchIndex = new SearchIndex(getDb),
  ) {}

  private get db() {
    return this.getDb();
  }

  // --- Lesen ----------------------------------------------------------------

  list(): Taxonomy {
    const categories = this.db
      .prepare(
        `SELECT c.id, c.name, c.source, c.sort_order AS sortOrder,
                (SELECT count(*) FROM journal_category jc WHERE jc.category_id = c.id) AS journalCount
         FROM category c ORDER BY c.sort_order, c.name COLLATE NOCASE`,
      )
      .all() as Category[];
    const tags = this.db
      .prepare(
        `SELECT t.id, t.name,
                (SELECT count(*) FROM journal_tag jt WHERE jt.tag_id = t.id) AS journalCount
         FROM tag t ORDER BY t.name COLLATE NOCASE`,
      )
      .all() as Tag[];
    // Sortierung nach deutschem Alphabet (SQLite sortiert «Ö» hinter «Z»)
    tags.sort((a, b) => a.name.localeCompare(b.name, 'de-CH'));
    return { categories, tags, missingSuggestions: this.missingSuggestions(categories).length };
  }

  // --- Kategorien -----------------------------------------------------------

  createCategory(name: string): Category {
    const id = randomUUID();
    transaction(this.db, () => {
      this.assertNameFree('category', name);
      const next = this.db.prepare('SELECT coalesce(max(sort_order), -1) + 1 AS n FROM category').get() as {
        n: number;
      };
      this.db
        .prepare("INSERT INTO category (id, name, source, sort_order) VALUES (?, ?, 'user', ?)")
        .run(id, name, next.n);
    });
    return this.list().categories.find((c) => c.id === id)!;
  }

  // Vorschlag-Kategorien a–g ergänzen, die fehlen (im Assistenten abgewählt
  // oder gelöscht). Massgebend ist der Name: Eine umbenannte Kategorie zählt
  // nicht mehr als Vorschlag.
  addMissingSuggestions(): number {
    const missing = this.missingSuggestions(this.list().categories);
    transaction(this.db, () => {
      const insert = this.db.prepare(
        "INSERT INTO category (id, name, source, sort_order) VALUES (?, ?, 'bipla', 0)",
      );
      for (const s of missing) insert.run(randomUUID(), s.name);
      this.renumberCategories();
    });
    return missing.length;
  }

  private missingSuggestions(existing: { name: string }[]) {
    const names = new Set(existing.map((c) => nameKey(c.name)));
    return BIPLA_CATEGORIES.filter((s) => !names.has(nameKey(s.name)));
  }

  // Reihenfolge neu durchnummerieren: Vorschläge a–g zuoberst in ihrer
  // Reihenfolge, danach alle übrigen wie bisher.
  private renumberCategories(): void {
    const rows = this.db
      .prepare('SELECT id, name FROM category ORDER BY sort_order, name COLLATE NOCASE')
      .all() as { id: string; name: string }[];
    const suggestionIndex = (name: string) =>
      BIPLA_CATEGORIES.findIndex((s) => nameKey(s.name) === nameKey(name));
    const rank = (r: { name: string }, i: number) => {
      const s = suggestionIndex(r.name);
      return s >= 0 ? s : BIPLA_CATEGORIES.length + i;
    };
    const ordered = rows.map((r, i) => ({ id: r.id, rank: rank(r, i) })).sort((a, b) => a.rank - b.rank);
    const update = this.db.prepare('UPDATE category SET sort_order = ? WHERE id = ?');
    ordered.forEach((r, i) => update.run(i, r.id));
  }

  // --- Gemeinsam für Kategorien und Schlagwörter ----------------------------

  rename(kind: TaxonomyKind, id: string, name: string): void {
    const t = TABLES[kind];
    transaction(this.db, () => {
      this.assertExists(kind, id);
      this.assertNameFree(kind, name, id);
      this.db.prepare(`UPDATE ${t.table} SET name = ? WHERE id = ?`).run(name, id);
      this.search.syncMany(this.journalsWith(kind, id));
    });
  }

  // Zusammenführen: Alle Journale von «source» bekommen «target»; danach wird
  // «source» gelöscht. Journale mit beiden behalten target genau einmal.
  merge(kind: TaxonomyKind, sourceId: string, targetId: string): void {
    const t = TABLES[kind];
    if (sourceId === targetId)
      throw new TaxonomyError(`${t.label} kann nicht mit sich selbst zusammengeführt werden.`);
    transaction(this.db, () => {
      this.assertExists(kind, sourceId);
      this.assertExists(kind, targetId);
      const affected = this.journalsWith(kind, sourceId);
      this.db
        .prepare(
          `INSERT OR IGNORE INTO ${t.link} (journal_id, ${t.fk})
           SELECT journal_id, ? FROM ${t.link} WHERE ${t.fk} = ?`,
        )
        .run(targetId, sourceId);
      // Zuordnungen von source verschwinden per ON DELETE CASCADE
      this.db.prepare(`DELETE FROM ${t.table} WHERE id = ?`).run(sourceId);
      this.search.syncMany(affected);
    });
  }

  // Löschen entfernt nur den Begriff und seine Zuordnungen, nie Journale
  delete(kind: TaxonomyKind, id: string): void {
    const t = TABLES[kind];
    transaction(this.db, () => {
      this.assertExists(kind, id);
      const affected = this.journalsWith(kind, id);
      this.db.prepare(`DELETE FROM ${t.table} WHERE id = ?`).run(id);
      this.search.syncMany(affected);
    });
  }

  // --- Zuordnung zu einem Journal -------------------------------------------

  // Ersetzt die Kategorien eines Journals durch genau diese Auswahl
  setJournalCategories(journalId: string, categoryIds: string[]): void {
    const unique = [...new Set(categoryIds)];
    transaction(this.db, () => {
      this.assertJournal(journalId);
      for (const id of unique) this.assertExists('category', id);
      this.db.prepare('DELETE FROM journal_category WHERE journal_id = ?').run(journalId);
      const insert = this.db.prepare('INSERT INTO journal_category (journal_id, category_id) VALUES (?, ?)');
      for (const id of unique) insert.run(journalId, id);
      this.touch(journalId);
      this.search.sync(journalId);
    });
  }

  // Ersetzt die Schlagwörter eines Journals. Namen statt IDs: Bestehende
  // Schlagwörter werden wiederverwendet («farbmessung» → «Farbmessung»),
  // neue angelegt, nicht mehr verwendete entfernt.
  setJournalTags(journalId: string, names: string[]): void {
    transaction(this.db, () => {
      this.assertJournal(journalId);
      const existing = this.db.prepare('SELECT id, name FROM tag').all() as { id: string; name: string }[];
      const byKey = new Map(existing.map((t) => [nameKey(t.name), t.id]));
      const ids = new Set<string>();
      const insertTag = this.db.prepare('INSERT INTO tag (id, name) VALUES (?, ?)');
      for (const name of names) {
        const key = nameKey(name);
        let id = byKey.get(key);
        if (!id) {
          id = randomUUID();
          insertTag.run(id, name);
          byKey.set(key, id);
        }
        ids.add(id);
      }
      this.db.prepare('DELETE FROM journal_tag WHERE journal_id = ?').run(journalId);
      const link = this.db.prepare('INSERT INTO journal_tag (journal_id, tag_id) VALUES (?, ?)');
      for (const id of ids) link.run(journalId, id);
      this.pruneUnusedTags();
      this.touch(journalId);
      this.search.sync(journalId);
    });
  }

  // Schlagwörter ohne Journal entfernen (nach Zuordnen oder Löschen eines Journals)
  pruneUnusedTags(): number {
    return Number(
      this.db.prepare('DELETE FROM tag WHERE id NOT IN (SELECT tag_id FROM journal_tag)').run().changes,
    );
  }

  // --- Hilfen ---------------------------------------------------------------

  // IDs der Journale mit dieser Kategorie bzw. diesem Schlagwort
  private journalsWith(kind: TaxonomyKind, id: string): string[] {
    const t = TABLES[kind];
    return (
      this.db.prepare(`SELECT journal_id AS j FROM ${t.link} WHERE ${t.fk} = ?`).all(id) as { j: string }[]
    ).map((r) => r.j);
  }

  // «Zuletzt geändert» des Journals nachführen (Startseite «Zuletzt bearbeitet»)
  private touch(journalId: string): void {
    this.db
      .prepare('UPDATE journal SET updated_at = ? WHERE id = ?')
      .run(this.now().toISOString(), journalId);
  }

  private assertJournal(id: string): void {
    if (!this.db.prepare('SELECT 1 FROM journal WHERE id = ?').get(id)) {
      throw new TaxonomyError('Journal nicht gefunden.');
    }
  }

  private assertExists(kind: TaxonomyKind, id: string): void {
    const t = TABLES[kind];
    if (!this.db.prepare(`SELECT 1 FROM ${t.table} WHERE id = ?`).get(id)) {
      throw new TaxonomyError(`${t.label} nicht gefunden. Bitte die Ansicht neu laden.`);
    }
  }

  private assertNameFree(kind: TaxonomyKind, name: string, exceptId?: string): void {
    const t = TABLES[kind];
    const rows = this.db.prepare(`SELECT id, name FROM ${t.table}`).all() as { id: string; name: string }[];
    const clash = rows.find((r) => r.id !== exceptId && nameKey(r.name) === nameKey(name));
    if (clash) {
      throw new TaxonomyError(`«${clash.name}» gibt es schon. Zum Zusammenlegen «Zusammenführen» verwenden.`);
    }
  }
}
