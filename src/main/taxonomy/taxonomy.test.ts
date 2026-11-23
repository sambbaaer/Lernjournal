// Tests des Kategorien-/Schlagwort-Dienstes (AJ-09) auf einer echten Projektdatenbank.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BIPLA_CATEGORIES } from '@shared/bipla';
import { ipcContract } from '@shared/ipc';
import { checkIntegrity } from '../db/connection';
import { JournalService } from '../journal/journal-service';
import { ProjectService } from '../project/project-service';
import { TaxonomyError, TaxonomyService } from './taxonomy-service';

let root: string;
let projects: ProjectService;
let journals: JournalService;
let taxonomy: TaxonomyService;

async function setup(seedCategories: boolean) {
  root = mkdtempSync(path.join(tmpdir(), 'lj-t-'));
  projects = new ProjectService({
    appVersion: '0.1.0',
    env: {},
    lockEnv: { pid: 1, hostname: 'PC', isProcessAlive: () => true, now: () => new Date() },
  });
  await projects.create({
    dir: path.join(root, 'p'),
    title: 'P',
    profile: { displayName: 'Lea', company: null, apprenticeshipStart: null, specialization: 'print' },
    seedCategories,
  });
  const clock = () => new Date('2026-03-14T09:00:00Z');
  journals = new JournalService(
    () => projects.db,
    () => projects.dir,
    clock,
  );
  taxonomy = new TaxonomyService(() => projects.db, clock);
}

const cat = (code: string) => taxonomy.list().categories.find((c) => c.name.startsWith(`${code} –`))!;
const tagNames = (journalId: string) => {
  const byId = new Map(taxonomy.list().tags.map((t) => [t.id, t.name]));
  return journals.summary(journalId).tagIds.map((id) => byId.get(id));
};

afterEach(() => {
  projects.close();
  rmSync(root, { recursive: true, force: true });
});

describe('Kategorien', () => {
  beforeEach(() => setup(true));

  it('Vorschläge a–g sind nach der Projektanlage vorhanden, in Reihenfolge', () => {
    const t = taxonomy.list();
    expect(t.categories.map((c) => c.name)).toEqual(BIPLA_CATEGORIES.map((c) => c.name));
    expect(t.categories.every((c) => c.source === 'bipla' && c.journalCount === 0)).toBe(true);
    expect(t.missingSuggestions).toBe(0);
  });

  it('Mehrfachzuordnung: ein Journal in mehreren Kategorien, ohne Kopie des Inhalts', () => {
    const j = journals.create({ title: 'Farbmessung' });
    taxonomy.setJournalCategories(j.id, [cat('e').id, cat('a').id, cat('e').id]);
    // Reihenfolge wie in der Kategorienliste, Doppelte nur einmal
    expect(journals.summary(j.id).categoryIds).toEqual([cat('a').id, cat('e').id]);
    expect(journals.list({ includeArchived: true })).toHaveLength(1);
    expect(cat('e').journalCount).toBe(1);
    // Auswahl ersetzen
    taxonomy.setJournalCategories(j.id, []);
    expect(journals.summary(j.id).categoryIds).toEqual([]);
  });

  it('eigene Kategorie anlegen: kommt ans Ende, Name eindeutig auch bei Umlauten', () => {
    taxonomy.createCategory('Ölwechsel und Wartung');
    const t = taxonomy.list();
    expect(t.categories.at(-1)).toMatchObject({
      name: 'Ölwechsel und Wartung',
      source: 'user',
      sortOrder: 7,
    });
    // SQLite-NOCASE allein würde «ö»/«Ö» nicht als gleich erkennen
    expect(() => taxonomy.createCategory('ölwechsel und wartung')).toThrow(TaxonomyError);
    expect(() => taxonomy.createCategory('ölwechsel und wartung')).toThrow(/gibt es schon/);
  });

  it('umbenennen; Gross-/Kleinschreibung des eigenen Namens ändern ist erlaubt', () => {
    const a = cat('a');
    taxonomy.rename('category', a.id, 'Produktion');
    expect(taxonomy.list().categories[0]).toMatchObject({ id: a.id, name: 'Produktion', source: 'bipla' });
    taxonomy.rename('category', a.id, 'PRODUKTION');
    expect(taxonomy.list().categories[0]!.name).toBe('PRODUKTION');
    expect(() => taxonomy.rename('category', a.id, cat('b').name)).toThrow(/gibt es schon/);
  });

  it('zusammenführen: Journale wandern zum Ziel, ohne doppelte Zuordnung', () => {
    const j1 = journals.create({ title: 'nur d' });
    const j2 = journals.create({ title: 'd und e' });
    const [d, e] = [cat('d'), cat('e')];
    taxonomy.setJournalCategories(j1.id, [d.id]);
    taxonomy.setJournalCategories(j2.id, [d.id, e.id]);
    taxonomy.merge('category', d.id, e.id);
    expect(journals.summary(j1.id).categoryIds).toEqual([e.id]);
    expect(journals.summary(j2.id).categoryIds).toEqual([e.id]);
    const t = taxonomy.list();
    expect(t.categories.find((c) => c.id === d.id)).toBeUndefined();
    expect(t.categories.find((c) => c.id === e.id)!.journalCount).toBe(2);
    expect(() => taxonomy.merge('category', e.id, e.id)).toThrow(TaxonomyError);
    expect(checkIntegrity(projects.db)).toEqual([]);
  });

  it('löschen entfernt nur Kategorie und Zuordnungen, nie Journale', () => {
    const j = journals.create({ title: 'X' });
    taxonomy.setJournalCategories(j.id, [cat('c').id]);
    taxonomy.delete('category', cat('c').id);
    expect(journals.summary(j.id)).toMatchObject({ title: 'X', categoryIds: [] });
    expect(taxonomy.list().categories).toHaveLength(6);
  });

  it('unbekannte IDs: verständlicher Fehler, nichts verändert', () => {
    const j = journals.create();
    taxonomy.setJournalCategories(j.id, [cat('a').id]);
    const unknown = '00000000-0000-4000-8000-000000000000';
    expect(() => taxonomy.setJournalCategories(j.id, [cat('b').id, unknown])).toThrow(/nicht gefunden/);
    expect(journals.summary(j.id).categoryIds).toEqual([cat('a').id]); // Transaktion zurückgerollt
    expect(() => taxonomy.setJournalCategories(unknown, [])).toThrow(/Journal nicht gefunden/);
    expect(() => taxonomy.rename('tag', unknown, 'x')).toThrow(/nicht gefunden/);
  });

  it('Journal löschen lässt Kategorien bestehen', () => {
    const j = journals.create();
    taxonomy.setJournalCategories(j.id, [cat('a').id]);
    journals.delete(j.id);
    expect(taxonomy.list().categories).toHaveLength(7);
    expect(cat('a').journalCount).toBe(0);
  });
});

describe('Vorschlag-Kategorien nachträglich ergänzen (R-05)', () => {
  beforeEach(() => setup(false));

  it('im Assistenten abgewählt: alle 7 fehlen und lassen sich ergänzen', () => {
    taxonomy.createCategory('Eigenes');
    expect(taxonomy.list()).toMatchObject({ categories: [{ name: 'Eigenes' }], missingSuggestions: 7 });
    expect(taxonomy.addMissingSuggestions()).toBe(7);
    const names = taxonomy.list().categories.map((c) => c.name);
    // a–g zuoberst, eigene Kategorie danach
    expect(names).toEqual([...BIPLA_CATEGORIES.map((c) => c.name), 'Eigenes']);
    expect(taxonomy.list().categories.map((c) => c.sortOrder)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(taxonomy.addMissingSuggestions()).toBe(0);
  });

  it('nur gelöschte werden ergänzt, an ihrem Platz', () => {
    taxonomy.addMissingSuggestions();
    taxonomy.delete('category', cat('b').id);
    taxonomy.delete('category', cat('f').id);
    expect(taxonomy.list().missingSuggestions).toBe(2);
    expect(taxonomy.addMissingSuggestions()).toBe(2);
    expect(taxonomy.list().categories.map((c) => c.name)).toEqual(BIPLA_CATEGORIES.map((c) => c.name));
  });
});

describe('Schlagwörter', () => {
  beforeEach(() => setup(true));

  it('werden beim Zuordnen angelegt und gross/klein-unabhängig wiederverwendet', () => {
    const j1 = journals.create();
    const j2 = journals.create();
    taxonomy.setJournalTags(j1.id, ['Farbmessung', 'Spektralfotometer']);
    taxonomy.setJournalTags(j2.id, ['farbmessung', 'Ölfarbe', 'ÖLFARBE']);
    expect(tagNames(j2.id)).toEqual(['Farbmessung', 'Ölfarbe']);
    const t = taxonomy.list();
    // Deutsche Sortierung: «Ö» neben «O», nicht hinter «Z»
    expect(t.tags.map((x) => [x.name, x.journalCount])).toEqual([
      ['Farbmessung', 2],
      ['Ölfarbe', 1],
      ['Spektralfotometer', 1],
    ]);
  });

  it('nicht mehr verwendete Schlagwörter verschwinden automatisch', () => {
    const j1 = journals.create();
    const j2 = journals.create();
    taxonomy.setJournalTags(j1.id, ['Tippfehlr', 'Falz']);
    taxonomy.setJournalTags(j2.id, ['Falz']);
    taxonomy.setJournalTags(j1.id, ['Falz']);
    expect(taxonomy.list().tags.map((t) => t.name)).toEqual(['Falz']);
    // auch beim Löschen eines Journals
    taxonomy.setJournalTags(j1.id, ['Nur hier']);
    journals.delete(j1.id);
    expect(taxonomy.list().tags.map((t) => t.name)).toEqual(['Falz']);
  });

  it('umbenennen, zusammenführen, löschen', () => {
    const j1 = journals.create();
    const j2 = journals.create();
    taxonomy.setJournalTags(j1.id, ['Druckplatte', 'CTP']);
    taxonomy.setJournalTags(j2.id, ['Platte']);
    const id = (n: string) => taxonomy.list().tags.find((t) => t.name === n)!.id;
    taxonomy.rename('tag', id('CTP'), 'Computer to Plate');
    expect(() => taxonomy.rename('tag', id('Platte'), 'druckplatte')).toThrow(/Zusammenführen/);
    taxonomy.merge('tag', id('Platte'), id('Druckplatte'));
    expect(tagNames(j2.id)).toEqual(['Druckplatte']);
    taxonomy.delete('tag', id('Computer to Plate'));
    expect(tagNames(j1.id)).toEqual(['Druckplatte']);
  });

  it('Duplizieren übernimmt Kategorien und Schlagwörter', () => {
    const j = journals.create({ title: 'Original' });
    taxonomy.setJournalCategories(j.id, [cat('e').id]);
    taxonomy.setJournalTags(j.id, ['Farbmessung']);
    const copy = journals.duplicate(j.id);
    expect(copy).toMatchObject({ categoryIds: [cat('e').id] });
    expect(tagNames(copy.id)).toEqual(['Farbmessung']);
  });

  it('Zuordnen führt «zuletzt geändert» nach', () => {
    const j = journals.create();
    const later = new TaxonomyService(
      () => projects.db,
      () => new Date('2026-03-15T08:00:00Z'),
    );
    later.setJournalTags(j.id, ['A']);
    expect(journals.summary(j.id).updatedAt).toBe('2026-03-15T08:00:00.000Z');
  });
});

describe('Namensprüfung an der IPC-Grenze', () => {
  const rename = ipcContract['taxonomy:rename'].request;
  const setTags = ipcContract['journal:setTags'].request;
  const id = '11111111-1111-4111-8111-111111111111';

  it('vereinheitlicht Leerraum und entfernt «#» bei Schlagwörtern', () => {
    expect(setTags.parse({ id, names: ['  #Farb   messung ', '##CTP'] }).names).toEqual([
      'Farb messung',
      'CTP',
    ]);
    expect(rename.parse({ kind: 'category', id, name: '  a  –  Neu ' }).name).toBe('a – Neu');
  });

  it('lehnt leere, zu lange und Komma-Namen ab', () => {
    expect(setTags.safeParse({ id, names: ['  '] }).success).toBe(false);
    expect(setTags.safeParse({ id, names: ['a,b'] }).success).toBe(false);
    expect(setTags.safeParse({ id, names: ['x'.repeat(61)] }).success).toBe(false);
    expect(rename.safeParse({ kind: 'tag', id, name: 'x'.repeat(61) }).success).toBe(false);
    // Kategorien dürfen länger sein (Bereiche a–g) und Kommas enthalten
    expect(rename.safeParse({ kind: 'category', id, name: 'x'.repeat(61) + ', y' }).success).toBe(true);
    expect(rename.safeParse({ kind: 'category', id, name: 'x'.repeat(121) }).success).toBe(false);
  });

  it('lehnt fremde Arten und ungültige IDs ab', () => {
    const del = ipcContract['taxonomy:delete'].request;
    expect(del.safeParse({ kind: 'journal', id }).success).toBe(false);
    expect(del.safeParse({ kind: 'tag', id: "1' OR 1=1" }).success).toBe(false);
  });
});
