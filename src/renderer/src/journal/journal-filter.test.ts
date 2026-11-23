// Filter der Journalliste (AJ-09): Status, Titel, Kategorie, Schlagwort.
import { describe, expect, it } from 'vitest';
import type { JournalSummary } from '@shared/journal';
import { DEFAULT_FILTER, matchesFilter, sanitizeFilter, type JournalFilter } from './journal-filter';

const j = (over: Partial<JournalSummary>): JournalSummary => ({
  id: 'x',
  title: 'Farbmessung',
  workDate: '2026-11-23',
  status: 'draft',
  learningPlace: 'betrieb',
  schoolYear: null,
  schoolYearOverride: null,
  updatedAt: '2026-11-23T10:00:00.000Z',
  completedAt: null,
  categoryIds: [],
  tagIds: [],
  ...over,
});
const f = (over: Partial<JournalFilter>): JournalFilter => ({ ...DEFAULT_FILTER, ...over });

describe('Journalfilter', () => {
  it('Standard: alles ausser Archiv', () => {
    expect(matchesFilter(j({}), DEFAULT_FILTER)).toBe(true);
    expect(matchesFilter(j({ status: 'archived' }), DEFAULT_FILTER)).toBe(false);
    expect(matchesFilter(j({ status: 'archived' }), f({ status: 'archived' }))).toBe(true);
  });

  it('Titel: Teilwort, ohne Gross-/Kleinschreibung, auch Umlaute', () => {
    expect(matchesFilter(j({}), f({ text: 'MESSUNG' }))).toBe(true);
    expect(matchesFilter(j({ title: 'Ölwechsel' }), f({ text: 'öl' }))).toBe(true);
    expect(matchesFilter(j({}), f({ text: 'Falz' }))).toBe(false);
  });

  it('Kategorie: bestimmte, «ohne Kategorie» und Mehrfachzuordnung', () => {
    const multi = j({ categoryIds: ['a', 'e'] });
    expect(matchesFilter(multi, f({ category: 'a' }))).toBe(true);
    expect(matchesFilter(multi, f({ category: 'e' }))).toBe(true);
    expect(matchesFilter(multi, f({ category: 'b' }))).toBe(false);
    expect(matchesFilter(multi, f({ category: 'none' }))).toBe(false);
    expect(matchesFilter(j({}), f({ category: 'none' }))).toBe(true);
  });

  it('Schlagwort und Kategorie zusammen (UND)', () => {
    const x = j({ categoryIds: ['e'], tagIds: ['t1'] });
    expect(matchesFilter(x, f({ category: 'e', tag: 't1' }))).toBe(true);
    expect(matchesFilter(x, f({ category: 'e', tag: 't2' }))).toBe(false);
  });

  it('Filter auf gelöschte Kategorie/Schlagwort fällt auf «Alle» zurück', () => {
    const stale = f({ category: 'weg', tag: 'auch-weg' });
    expect(sanitizeFilter(stale, ['a'], ['t1'])).toMatchObject({ category: 'all', tag: 'all' });
    const ok = f({ category: 'none', tag: 't1' });
    expect(sanitizeFilter(ok, ['a'], ['t1'])).toBe(ok); // unverändert, gleiches Objekt
  });
});
