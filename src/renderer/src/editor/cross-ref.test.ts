// Querverweise «[[…]]» (AJ-27)
import { describe, expect, it } from 'vitest';
import type { JournalSummary } from '@shared/journal';
import { journalLinkHref, tagLinkHref } from '@shared/links';
import type { Merkstelle } from '@shared/merkstellen';
import { crossRefCandidates, resolveTypedCrossRef } from './cross-ref';

const j = (id: string, title: string, status: JournalSummary['status'] = 'draft') =>
  ({ id, title, workDate: '2026-03-01', status }) as JournalSummary;
const tags = [{ id: 't1', name: 'Rakel' }] as never;
const merk = [
  {
    id: 'm1',
    term: 'Tonwertzunahme',
    text: 'TWZ',
    context: '',
    journalId: 'b',
    journalTitle: 'B',
    workDate: '2026-01-01',
    status: 'draft',
  },
] as Merkstelle[];
const journals = [j('a', 'Siebdruck Übung'), j('b', 'Druckabnahme'), j('c', 'Altes', 'archived')];

describe('Querverweise', () => {
  it('Auswahl: Journale (ohne eigenes und Archiv), Schlagwörter, Merkstellen', () => {
    const items = crossRefCandidates({
      query: '',
      journals,
      tags,
      merkstellen: merk,
      excludeJournalId: 'a',
      displayTitle: (t) => t,
      formatDate: (d) => d,
    });
    expect(items.map((i) => `${i.kind}:${i.id}`)).toEqual(['journal:b', 'tag:t1', 'merkstelle:m1']);
  });

  it('getipptes [[Begriff]] wird nur bei genauem Treffer zum Link', () => {
    const input = { journals, tags, merkstellen: merk, excludeJournalId: 'a' };
    expect(resolveTypedCrossRef('rakel', input)).toBe(tagLinkHref('t1'));
    expect(resolveTypedCrossRef('Tonwertzunahme', input)).toBe(journalLinkHref('b'));
    expect(resolveTypedCrossRef('druckabnahme', input)).toBe(journalLinkHref('b'));
    expect(resolveTypedCrossRef('Siebdruck Übung', input)).toBeNull(); // eigenes Journal
    expect(resolveTypedCrossRef('Unbekannt', input)).toBeNull();
  });
});
