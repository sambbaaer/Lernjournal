// Tests: Verknüpfungen (beide Richtungen, keine Duplikate) und Suche für die Auswahl.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { JournalService } from '../journal/journal-service';
import { ProjectService } from '../project/project-service';
import { ftsPrefixQuery, LinkError, LinkService } from './link-service';

let root: string;
let projects: ProjectService;
let journals: JournalService;
let links: LinkService;

beforeEach(async () => {
  root = mkdtempSync(path.join(tmpdir(), 'lj-link-'));
  projects = new ProjectService({
    appVersion: '0.1.0',
    env: {},
    lockEnv: { pid: 1, hostname: 'PC', isProcessAlive: () => true, now: () => new Date() },
  });
  await projects.create({
    dir: path.join(root, 'p'),
    title: 'P',
    profile: { displayName: '', company: null, apprenticeshipStart: null, specialization: 'print' },
    seedCategories: false,
  });
  journals = new JournalService(
    () => projects.db,
    () => projects.dir,
  );
  links = new LinkService(() => projects.db);
});
afterEach(() => {
  projects.close();
  rmSync(root, { recursive: true, force: true });
});

describe('Verknüpfungen', () => {
  it('einmal gespeichert, in beiden Journalen sichtbar (Rückverweis)', () => {
    const a = journals.create({ title: 'Farbmessung', workDate: '2026-03-01' });
    const b = journals.create({ title: 'Plattenwechsel', workDate: '2026-04-01' });
    links.add(a.id, b.id);
    expect(links.list(a.id)).toEqual([
      expect.objectContaining({ journalId: b.id, title: 'Plattenwechsel', direction: 'outgoing' }),
    ]);
    expect(links.list(b.id)).toEqual([
      expect.objectContaining({ journalId: a.id, title: 'Farbmessung', direction: 'incoming' }),
    ]);
    expect(projects.db.prepare('SELECT count(*) n FROM journal_link').get()).toEqual({ n: 1 });
  });

  it('doppelt (auch in Gegenrichtung) verknüpfen ist harmlos; Selbstlink wird abgelehnt', () => {
    const a = journals.create();
    const b = journals.create();
    links.add(a.id, b.id);
    links.add(a.id, b.id);
    links.add(b.id, a.id);
    expect(projects.db.prepare('SELECT count(*) n FROM journal_link').get()).toEqual({ n: 1 });
    expect(() => links.add(a.id, a.id)).toThrow(LinkError);
    expect(() => links.add(a.id, '00000000-0000-4000-8000-000000000000')).toThrow(LinkError);
  });

  it('Entfernen funktioniert von beiden Seiten; Löschen eines Journals entfernt seine Links', () => {
    const a = journals.create();
    const b = journals.create();
    const c = journals.create();
    links.add(a.id, b.id);
    links.add(c.id, a.id);
    links.remove(b.id, a.id); // von der «anderen» Seite
    expect(links.list(a.id).map((l) => l.journalId)).toEqual([c.id]);
    journals.delete(c.id);
    expect(links.list(a.id)).toEqual([]);
  });

  it('Suche für die Auswahl: Präfix, Umlaute, ohne das aktuelle Journal', () => {
    const a = journals.create({ title: 'Möglichkeiten der Falzung' });
    const b = journals.create({ title: 'Farbmessung am Bogen' });
    expect(links.search('farb').map((r) => r.id)).toEqual([b.id]);
    expect(links.search('moglich').map((r) => r.id)).toEqual([a.id]);
    expect(links.search('farb', { excludeId: b.id })).toEqual([]);
    // Ohne Suchbegriff: zuletzt geänderte, ohne das aktuelle
    expect(links.search('', { excludeId: a.id }).map((r) => r.id)).toEqual([b.id]);
  });

  it('Suchbegriffe werden für FTS entschärft (keine Operatoren aus der Eingabe)', () => {
    expect(ftsPrefixQuery('  farb "mess" OR* NEAR(x')).toBe('"farb"* "mess"* "OR"* "NEAR"* "x"*');
    expect(ftsPrefixQuery('"*()')).toBeNull();
    expect(() => links.search('"*() AND')).not.toThrow();
  });
});
