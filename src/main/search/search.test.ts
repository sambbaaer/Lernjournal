// Tests: Volltextsuche (Titel, Text, Legenden, Schlagwörter), Hervorhebung, Index-Neuaufbau.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Sections } from '@shared/journal';
import { JournalService } from '../journal/journal-service';
import { ProjectService } from '../project/project-service';
import { TaxonomyService } from '../taxonomy/taxonomy-service';
import { HL_END, HL_START, SearchService } from './search-service';

let root: string;
let projects: ProjectService;
let journals: JournalService;
let search: SearchService;
let tax: TaxonomyService;

const doc = (text: string) => ({
  type: 'doc' as const,
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

beforeEach(async () => {
  root = mkdtempSync(path.join(tmpdir(), 'lj-s-'));
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
  tax = new TaxonomyService(
    () => projects.db,
    (ids) => journals.resyncFts(ids),
  );
  search = new SearchService(
    () => projects.db,
    () => journals.rebuildFts(),
  );
});
afterEach(() => {
  projects.close();
  rmSync(root, { recursive: true, force: true });
});

describe('Volltextsuche', () => {
  it('findet Titel, Text, Bildlegenden und Schlagwörter – Titel zuerst', () => {
    const a = journals.create({ title: 'Feuchtwerk reinigen' });
    const b = journals.create({ title: 'Plattenwechsel' });
    const s: Sections = {
      ...b.sections,
      durchfuehrung: doc('Danach das Feuchtwerk kontrolliert und die Walzen gereinigt.'),
      auftrag: {
        type: 'doc',
        content: [{ type: 'figure', attrs: { mediaId: 'x', caption: 'Druckplatte eingespannt', alt: '' } }],
      },
    };
    // Bild-ID muss nicht existieren, da hier ohne Mediendienst gespeichert wird
    journals.updateSections(b.id, s);
    const c = journals.create({ title: 'Leporello' });
    tax.setJournalTags(c.id, ['Falzmaschine']);

    expect(search.search('feuchtwerk').map((r) => r.id)).toEqual([a.id, b.id]); // Titeltreffer zuerst
    expect(search.search('druckplatte').map((r) => r.id)).toEqual([b.id]); // Legende
    expect(search.search('falzmasch').map((r) => r.id)).toEqual([c.id]); // Schlagwort, Präfix
  });

  it('unabhängig von Gross-/Kleinschreibung und Umlauten; mehrere Wörter = alle', () => {
    const j = journals.create({ title: 'Möglichkeiten der Weiterverarbeitung' });
    journals.create({ title: 'Möglichkeiten im Druck' });
    expect(search.search('MOGLICHKEITEN weiter').map((r) => r.id)).toEqual([j.id]);
  });

  it('markiert Treffer mit Steuerzeichen statt HTML', () => {
    const j = journals.create({ title: 'Farbmessung <b>wichtig</b>' });
    journals.updateSections(j.id, {
      ...j.sections,
      reflexion: doc('Die Farbmessung zeigte Abweichungen beim Magenta.'),
    });
    const [hit] = search.search('farbmessung');
    expect(hit!.title).toBe(`${HL_START}Farbmessung${HL_END} <b>wichtig</b>`);
    expect(hit!.snippet).toContain(`${HL_START}Farbmessung${HL_END}`);
  });

  it('archivierte Journale nur auf Wunsch', () => {
    const j = journals.create({ title: 'Altes Thema' });
    journals.setStatus(j.id, 'archived');
    expect(search.search('altes')).toEqual([]);
    expect(search.search('altes', { includeArchived: true })).toHaveLength(1);
  });

  it('leere oder reine Sonderzeichen-Suche liefert nichts (ohne Fehler)', () => {
    journals.create({ title: 'X' });
    expect(search.search('')).toEqual([]);
    expect(search.search('"*()')).toEqual([]);
  });

  it('Index unvollständig erkennen und neu aufbauen', () => {
    const j = journals.create({ title: 'Farbmessung' });
    expect(search.isIndexComplete()).toBe(true);
    projects.db.prepare('DELETE FROM journal_fts').run();
    expect(search.isIndexComplete()).toBe(false);
    expect(search.search('farbmessung')).toEqual([]);
    expect(search.rebuild()).toBe(1);
    expect(search.isIndexComplete()).toBe(true);
    expect(search.search('farbmessung').map((r) => r.id)).toEqual([j.id]);
  });
});
