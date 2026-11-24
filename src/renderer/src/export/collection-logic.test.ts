// Zusammenstellung für das Sammel-DOCX (AJ-13): Filter, Auswahl, Reihenfolge.
import { describe, expect, it } from 'vitest';
import type { JournalSummary } from '@shared/journal';
import {
  DEFAULT_COLLECTION_FILTER,
  compareChronological,
  filterCandidates,
  indexJournals,
  insertChronologically,
  isChronological,
  moveItem,
  pruneSelection,
  rangeInverted,
  selectAll,
  sortChronologically,
  toggleSelection,
} from './collection-logic';

const j = (
  id: string,
  title: string,
  workDate: string,
  extra: Partial<JournalSummary> = {},
): JournalSummary => ({
  id,
  title,
  workDate,
  status: 'draft',
  learningPlace: 'betrieb',
  schoolYear: null,
  schoolYearOverride: null,
  updatedAt: '2026-01-01T00:00:00.000Z',
  completedAt: null,
  categoryIds: [],
  tagIds: [],
  ...extra,
});

// Bewusst nicht chronologisch angelegt (wie die Journalliste: neueste zuerst)
const JOURNALS = [
  j('c', 'Papier und Laufrichtung', '2026-06-20'),
  j('a', 'Farbmessung am Druckbogen', '2026-03-14', { tagIds: ['t1'] }),
  j('b', 'Druckplatte belichten', '2026-02-03'),
  j('z', 'Alte Übung', '2025-09-01', { status: 'archived' }),
];
const INDEX = indexJournals(JOURNALS);

describe('Filter der Auswahlliste', () => {
  it('Standard: alle ausser Archiv, chronologisch (ältestes zuerst)', () => {
    expect(filterCandidates(JOURNALS, DEFAULT_COLLECTION_FILTER).map((x) => x.id)).toEqual(['b', 'a', 'c']);
    expect(
      filterCandidates(JOURNALS, { ...DEFAULT_COLLECTION_FILTER, includeArchived: true }).map((x) => x.id),
    ).toEqual(['z', 'b', 'a', 'c']);
  });

  it('Zeitraum (Grenzen eingeschlossen) und Suche (ohne Umlaute/Gross-Klein, auch Schlagwörter)', () => {
    const f = { ...DEFAULT_COLLECTION_FILTER, from: '2026-02-03', to: '2026-03-14' };
    expect(filterCandidates(JOURNALS, f).map((x) => x.id)).toEqual(['b', 'a']);
    expect(filterCandidates(JOURNALS, { ...f, from: '', to: '2026-02-02' })).toEqual([]);
    const text = (t: string) =>
      filterCandidates(JOURNALS, { ...DEFAULT_COLLECTION_FILTER, text: t }, (x) =>
        x.tagIds.includes('t1') ? ['Spektralfotometer'] : [],
      ).map((x) => x.id);
    expect(text('DRUCK')).toEqual(['b', 'a']); // chronologisch, nicht nach Treffer im Titel
    expect(text('spektral')).toEqual(['a']);
    expect(text('14.03.2026')).toEqual(['a']);
    expect(text('uebung')).toEqual([]); // archiviert, ohne «Archivierte einbeziehen»
  });

  it('erkennt einen verkehrt eingegebenen Zeitraum', () => {
    expect(rangeInverted({ ...DEFAULT_COLLECTION_FILTER, from: '2026-05-01', to: '2026-04-01' })).toBe(true);
    expect(rangeInverted({ ...DEFAULT_COLLECTION_FILTER, from: '2026-05-01' })).toBe(false);
  });
});

describe('Auswahl und Reihenfolge', () => {
  it('Ankreuzen fügt chronologisch ein – egal in welcher Reihenfolge angekreuzt wird', () => {
    let order: string[] = [];
    for (const id of ['c', 'a', 'b']) order = toggleSelection(order, id, INDEX);
    expect(order).toEqual(['b', 'a', 'c']);
    // Abwählen entfernt, erneutes Ankreuzen setzt wieder an die zeitliche Stelle
    order = toggleSelection(order, 'a', INDEX);
    expect(order).toEqual(['b', 'c']);
    expect(toggleSelection(order, 'a', INDEX)).toEqual(['b', 'a', 'c']);
  });

  it('von Hand geänderte Reihenfolge bleibt beim Hinzufügen erhalten', () => {
    // c vor b gezogen; a (14.3.) kommt vor das erste spätere Journal (c, 20.6.)
    expect(insertChronologically(['c', 'b'], 'a', INDEX)).toEqual(['a', 'c', 'b']);
    expect(insertChronologically(['b'], 'b', INDEX)).toEqual(['b']); // keine Dublette
    expect(insertChronologically(['b'], 'unbekannt', INDEX)).toEqual(['b']);
  });

  it('Alle angezeigten auswählen: fehlende dazu, ohne Doppelte', () => {
    expect(selectAll(['a'], ['b', 'a', 'c'], INDEX)).toEqual(['b', 'a', 'c']);
  });

  it('Auf/Ab verschiebt um einen Platz, am Rand passiert nichts', () => {
    expect(moveItem(['b', 'a', 'c'], 2, -1)).toEqual(['b', 'c', 'a']);
    expect(moveItem(['b', 'a', 'c'], 0, 1)).toEqual(['a', 'b', 'c']);
    expect(moveItem(['b', 'a', 'c'], 0, -1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['b', 'a', 'c'], 2, 1)).toEqual(['b', 'a', 'c']);
  });

  it('chronologisch sortieren und prüfen', () => {
    expect(isChronological(['b', 'a', 'c'], INDEX)).toBe(true);
    expect(isChronological(['c', 'b'], INDEX)).toBe(false);
    expect(sortChronologically(['c', 'a', 'z', 'b'], INDEX)).toEqual(['z', 'b', 'a', 'c']);
    // Gleiches Datum: nach Titel (stabil)
    const same = indexJournals([j('1', 'Zweites', '2026-01-01'), j('2', 'Erstes', '2026-01-01')]);
    expect(sortChronologically(['1', '2'], same)).toEqual(['2', '1']);
    expect(compareChronological(j('x', 'a', '2026-01-01'), j('y', 'A', '2026-01-01'))).toBeLessThan(0);
  });

  it('gelöschte Journale fallen aus der Auswahl', () => {
    expect(pruneSelection(['b', 'weg', 'a'], INDEX)).toEqual(['b', 'a']);
  });
});
