import { describe, expect, it } from 'vitest';
import type { JournalSummary } from '@shared/journal';
import type { SearchHit } from '@shared/search';
import type { Taxonomy } from '@shared/taxonomy';
import type { ProjectInfo } from '@shared/ipc';
import { initialState, reducer } from '../state/app-state';
import {
  countLabel,
  fachbuchItems,
  filterMerkstellen,
  groupByLetter,
  inScope,
  INITIAL_FACHBUCH,
  relatedTags,
  sameScope,
  sanitizeScope,
  scopeLabel,
  topicOverview,
  visibleJournals,
} from './fachbuch-logic';

const j = (id: string, extra: Partial<JournalSummary> = {}): JournalSummary => ({
  template: 'report',
  id,
  title: id,
  workDate: '2026-03-14',
  status: 'draft',
  learningPlace: 'betrieb',
  schoolYear: null,
  schoolYearOverride: null,
  updatedAt: '2026-03-14T09:00:00.000Z',
  qvSelected: false,
  completedAt: null,
  categoryIds: [],
  tagIds: [],
  ...extra,
});

const taxonomy: Taxonomy = {
  categories: [
    { id: 'ca', name: 'a – Umsetzen', source: 'bipla', sortOrder: 0, journalCount: 0 },
    { id: 'ce', name: 'e – Druckaufträge', source: 'bipla', sortOrder: 1, journalCount: 0 },
  ],
  tags: [
    { id: 'tf', name: 'Farbmessung', journalCount: 0 },
    { id: 'to', name: 'Offset', journalCount: 0 },
    { id: 'tp', name: 'Proof', journalCount: 0 },
  ],
  missingSuggestions: 0,
};

const journals = [
  j('1', { categoryIds: ['ce'], tagIds: ['tf', 'to'] }),
  j('2', { categoryIds: ['ce'], tagIds: ['to'] }),
  j('3', { tagIds: ['tp'] }),
  j('4', { status: 'archived', categoryIds: ['ca'], tagIds: ['tp'] }),
];
const hit = (id: string): SearchHit => ({ id, title: id, snippet: null, matchedIn: ['title'] });

describe('Fachbuch: Ausschnitte (Themen, Schlagwörter)', () => {
  it('ordnet Journale dem gewählten Ausschnitt zu', () => {
    expect(inScope(journals[0]!, { kind: 'all' })).toBe(true);
    expect(inScope(journals[0]!, { kind: 'category', id: 'ce' })).toBe(true);
    expect(inScope(journals[0]!, { kind: 'uncategorized' })).toBe(false);
    expect(inScope(journals[2]!, { kind: 'uncategorized' })).toBe(true);
    expect(inScope(journals[2]!, { kind: 'tag', id: 'tp' })).toBe(true);
    expect(sameScope({ kind: 'tag', id: 'a' }, { kind: 'tag', id: 'a' })).toBe(true);
    expect(sameScope({ kind: 'tag', id: 'a' }, { kind: 'category', id: 'a' })).toBe(false);
  });

  it('gelöschte Kategorie oder entferntes Schlagwort → wieder «Alle Journale»', () => {
    expect(sanitizeScope({ kind: 'category', id: 'weg' }, taxonomy)).toEqual({ kind: 'all' });
    expect(sanitizeScope({ kind: 'tag', id: 'weg' }, taxonomy)).toEqual({ kind: 'all' });
    const ok = { kind: 'tag', id: 'to' } as const;
    expect(sanitizeScope(ok, taxonomy)).toBe(ok);
  });

  it('Titel des Ausschnitts', () => {
    expect(scopeLabel({ kind: 'all' }, taxonomy)).toBe('Alle Journale');
    expect(scopeLabel({ kind: 'category', id: 'ce' }, taxonomy)).toBe('e – Druckaufträge');
    expect(scopeLabel({ kind: 'tag', id: 'to' }, taxonomy)).toBe('Schlagwort «Offset»');
    expect(scopeLabel({ kind: 'uncategorized' }, taxonomy)).toBe('Ohne Kategorie');
  });

  it('Übersicht zählt nur sichtbare Journale; leere Kategorien bleiben, ungenutzte Schlagwörter nicht', () => {
    const visible = visibleJournals(journals, false);
    expect(visible.map((x) => x.id)).toEqual(['1', '2', '3']);
    const o = topicOverview(visible, taxonomy);
    expect(o.total).toBe(3);
    expect(o.categories).toEqual([
      { id: 'ca', name: 'a – Umsetzen', count: 0 },
      { id: 'ce', name: 'e – Druckaufträge', count: 2 },
    ]);
    expect(o.uncategorized).toBe(1);
    expect(o.tags.map((t) => [t.name, t.count])).toEqual([
      ['Farbmessung', 1],
      ['Offset', 2],
      ['Proof', 1],
    ]);
    // Mit Archiv
    expect(topicOverview(visibleJournals(journals, true), taxonomy).categories[0]!.count).toBe(1);
  });

  it('verwandte Schlagwörter: häufigste zuerst, ohne das gewählte', () => {
    const inE = journals.filter((x) => inScope(x, { kind: 'category', id: 'ce' }));
    expect(relatedTags(inE, { kind: 'category', id: 'ce' }, taxonomy).map((t) => [t.name, t.count])).toEqual([
      ['Offset', 2],
      ['Farbmessung', 1],
    ]);
    const withOffset = journals.filter((x) => inScope(x, { kind: 'tag', id: 'to' }));
    expect(relatedTags(withOffset, { kind: 'tag', id: 'to' }, taxonomy).map((t) => t.name)).toEqual([
      'Farbmessung',
    ]);
    expect(relatedTags(journals, { kind: 'all' }, taxonomy)).toEqual([]);
  });
});

describe('Fachbuch: Einträge mit und ohne Suche', () => {
  const visible = visibleJournals(journals, false);

  it('ohne Suchbegriff: alle Journale im Ausschnitt', () => {
    const r = fachbuchItems(visible, { kind: 'category', id: 'ce' }, null);
    expect(r.items.map((i) => i.journal.id)).toEqual(['1', '2']);
    expect(r.items.every((i) => i.hit === null)).toBe(true);
  });

  it('mit Suchbegriff: Reihenfolge der Suche, eingeschränkt auf den Ausschnitt, Rest gezählt', () => {
    const hits = [hit('3'), hit('2'), hit('1'), hit('4'), hit('gibts-nicht')];
    const all = fachbuchItems(visible, { kind: 'all' }, hits);
    expect(all.items.map((i) => i.journal.id)).toEqual(['3', '2', '1']); // 4 archiviert, unbekannt fehlt
    expect(all.outsideScope).toBe(0);
    const inE = fachbuchItems(visible, { kind: 'category', id: 'ce' }, hits);
    expect(inE.items.map((i) => i.journal.id)).toEqual(['2', '1']);
    expect(inE.outsideScope).toBe(1);
    expect(inE.items[0]!.hit).toEqual(hit('2'));
  });

  it('Mengenangaben', () => {
    expect(countLabel(1, 'Journal', 'Journale')).toBe('1 Journal');
    expect(countLabel(0, 'Journal', 'Journale')).toBe('0 Journale');
  });
});

describe('Fachbuch-Zustand', () => {
  it('Änderungen werden übernommen und beim Projektwechsel zurückgesetzt', () => {
    let s = reducer(initialState, { type: 'fachbuchChanged', change: { query: 'Rakel' } });
    s = reducer(s, { type: 'fachbuchChanged', change: { scope: { kind: 'tag', id: 'to' } } });
    expect(s.fachbuch).toEqual({ query: 'Rakel', scope: { kind: 'tag', id: 'to' }, includeArchived: false });
    // Navigation behält die Suche (zurück aus einem geöffneten Journal)
    s = reducer(s, { type: 'navigate', view: 'journale' });
    expect(s.fachbuch.query).toBe('Rakel');
    const project = { id: 'p2', title: 'P', path: 'C:\\P', migratedFromVersion: null } as ProjectInfo;
    expect(reducer(s, { type: 'projectOpened', project }).fachbuch).toEqual(INITIAL_FACHBUCH);
    expect(reducer(s, { type: 'projectClosed' }).fachbuch).toEqual(INITIAL_FACHBUCH);
  });
});

describe('Merkstellen im Fachbuch (AJ-33)', () => {
  const m = (term: string, status: 'draft' | 'archived' = 'draft') => ({
    id: term,
    term,
    text: '',
    context: 'Absatz',
    journalId: 'j',
    journalTitle: 'Journal',
    workDate: '2026-01-01',
    status,
  });

  it('filtert nach Begriff, ohne Archiv, und gruppiert A–Z', () => {
    const list = [m('Überfüller'), m('Rakel'), m('Alt', 'archived'), m('3D-Druck')];
    expect(filterMerkstellen(list, '', false).map((x) => x.term)).toEqual([
      'Überfüller',
      'Rakel',
      '3D-Druck',
    ]);
    expect(filterMerkstellen(list, 'uberf', false).map((x) => x.term)).toEqual(['Überfüller']);
    expect(groupByLetter(filterMerkstellen(list, '', true)).map((g) => g.letter)).toEqual([
      'A',
      'R',
      'U',
      '#',
    ]);
  });
});
