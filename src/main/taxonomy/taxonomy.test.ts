// Tests: Kategorien und Schlagwörter (Zuordnen, Umbenennen, Zusammenführen, Löschen, Suche).
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { JournalService } from '../journal/journal-service';
import { ProjectService } from '../project/project-service';
import { cleanName, TaxonomyError, TaxonomyService } from './taxonomy-service';

let root: string;
let projects: ProjectService;
let journals: JournalService;
let tax: TaxonomyService;

beforeEach(async () => {
  root = mkdtempSync(path.join(tmpdir(), 'lj-tax-'));
  projects = new ProjectService({
    appVersion: '0.1.0',
    env: {},
    lockEnv: { pid: 1, hostname: 'PC', isProcessAlive: () => true, now: () => new Date() },
  });
  await projects.create({
    dir: path.join(root, 'p'),
    title: 'P',
    profile: { displayName: '', company: null, apprenticeshipStart: null, specialization: 'print' },
    seedCategories: true,
  });
  journals = new JournalService(
    () => projects.db,
    () => projects.dir,
  );
  tax = new TaxonomyService(
    () => projects.db,
    (ids) => journals.resyncFts(ids),
  );
});
afterEach(() => {
  projects.close();
  rmSync(root, { recursive: true, force: true });
});

const search = (q: string) =>
  (
    projects.db.prepare('SELECT journal_id AS id FROM journal_fts WHERE journal_fts MATCH ?').all(q) as {
      id: string;
    }[]
  ).map((r) => r.id);

describe('Kategorien', () => {
  it('Vorschlag-Kategorien a–g sind in Reihenfolge da; eigene kommen ans Ende', () => {
    tax.create('category', 'Eigenes Projekt');
    const names = tax.list().categories.map((c) => c.name);
    expect(names[0]).toMatch(/^a – /);
    expect(names[6]).toMatch(/^g – /);
    expect(names.at(-1)).toBe('Eigenes Projekt');
  });

  it('Mehrfachzuordnung, Zähler und Zusammenfassung des Journals', () => {
    const j = journals.create({ title: 'Farbmessung' });
    const [a, e] = [tax.list().categories[0]!, tax.list().categories[4]!];
    tax.setJournalCategories(j.id, [a.id, e.id, e.id]);
    expect(journals.summary(j.id).categoryIds.sort()).toEqual([a.id, e.id].sort());
    expect(tax.list().categories.find((c) => c.id === e.id)?.count).toBe(1);
    // Zuordnung wieder entfernen – freiwillig, auch leer erlaubt
    tax.setJournalCategories(j.id, []);
    expect(journals.summary(j.id).categoryIds).toEqual([]);
  });

  it('unbekannte Kategorie-ID wird abgelehnt (Fremdschlüssel)', () => {
    const j = journals.create();
    expect(() => tax.setJournalCategories(j.id, ['00000000-0000-4000-8000-000000000000'])).toThrow();
  });
});

describe('Schlagwörter', () => {
  it('werden beim Zuordnen angelegt, ohne Duplikate (Gross-/Kleinschreibung), und sind durchsuchbar', () => {
    const j = journals.create({ title: 'Plattenwechsel' });
    tax.setJournalTags(j.id, ['Offsetdruck', ' offsetdruck ', 'Sicherheit']);
    expect(tax.list().tags.map((t) => t.name)).toEqual(['Offsetdruck', 'Sicherheit']);
    expect(search('offsetdruck')).toEqual([j.id]);
  });

  it('nicht mehr verwendete Schlagwörter verschwinden automatisch', () => {
    const a = journals.create();
    const b = journals.create();
    tax.setJournalTags(a.id, ['Falzen', 'Rillen']);
    tax.setJournalTags(b.id, ['Falzen']);
    tax.setJournalTags(a.id, []);
    expect(tax.list().tags.map((t) => t.name)).toEqual(['Falzen']);
    journals.delete(b.id);
    expect(tax.list().tags).toEqual([]);
  });

  it('Umbenennen aktualisiert die Suche; Kollision wird verständlich gemeldet', () => {
    const j = journals.create();
    tax.setJournalTags(j.id, ['Farbmesung', 'Druck']);
    const typo = tax.list().tags.find((t) => t.name === 'Farbmesung')!;
    tax.rename('tag', typo.id, 'Farbmessung');
    expect(search('farbmessung')).toEqual([j.id]);
    expect(search('farbmesung')).toEqual([]);
    expect(() => tax.rename('tag', typo.id, 'druck')).toThrow(/gibt es schon/);
    // Nur Gross-/Kleinschreibung ändern ist erlaubt
    tax.rename('tag', typo.id, 'FARBMESSUNG');
  });

  it('Zusammenführen: Journale bekommen das Ziel, keine Doppelzuordnung, Quelle verschwindet', () => {
    const a = journals.create();
    const b = journals.create();
    tax.setJournalTags(a.id, ['UV-Lack']);
    tax.setJournalTags(b.id, ['UV-Lack', 'Lackierung']);
    const { tags } = tax.list();
    const uv = tags.find((t) => t.name === 'UV-Lack')!;
    const lack = tags.find((t) => t.name === 'Lackierung')!;
    tax.merge('tag', uv.id, lack.id);
    expect(tax.list().tags).toEqual([{ id: lack.id, name: 'Lackierung', count: 2 }]);
    expect(journals.summary(a.id).tagIds).toEqual([lack.id]);
    expect(journals.summary(b.id).tagIds).toEqual([lack.id]);
    expect(() => tax.merge('tag', lack.id, lack.id)).toThrow(TaxonomyError);
  });

  it('Löschen einer Kategorie entfernt nur die Zuordnung, nicht die Journale', () => {
    const j = journals.create();
    const c = tax.list().categories[0]!;
    tax.setJournalCategories(j.id, [c.id]);
    tax.delete('category', c.id);
    expect(journals.summary(j.id).categoryIds).toEqual([]);
    expect(journals.list({ includeArchived: true })).toHaveLength(1);
  });

  it('Namen: leer und überlang werden abgelehnt, Leerraum bereinigt', () => {
    expect(cleanName('  UV   Lack ')).toBe('UV Lack');
    expect(() => cleanName('   ')).toThrow(TaxonomyError);
    expect(() => cleanName('x'.repeat(81))).toThrow(TaxonomyError);
  });

  it('Duplizieren übernimmt Kategorien und Schlagwörter', () => {
    const j = journals.create({ title: 'Vorlage' });
    tax.setJournalTags(j.id, ['Bogenoffset']);
    tax.setJournalCategories(j.id, [tax.list().categories[4]!.id]);
    const copy = journals.duplicate(j.id);
    expect(copy.tagIds).toHaveLength(1);
    expect(copy.categoryIds).toHaveLength(1);
    expect(tax.list().tags[0]!.count).toBe(2);
  });
});
