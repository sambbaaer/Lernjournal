// Schnellsuche Strg+K (AJ-26)
import { describe, expect, it } from 'vitest';
import type { JournalSummary } from '@shared/journal';
import { MARK_END, MARK_START } from '@shared/search';
import { buildQuickResults } from './quick-search';

const j = (id: string, title: string, over: Partial<JournalSummary> = {}): JournalSummary => ({
  id,
  title,
  template: 'report',
  workDate: '2026-03-01',
  status: 'draft',
  qvSelected: false,
  learningPlace: 'betrieb',
  schoolYear: 1,
  schoolYearOverride: null,
  updatedAt: `2026-03-01T10:00:0${id.length % 10}.000Z`,
  completedAt: null,
  categoryIds: [],
  tagIds: [],
  ...over,
});

const taxonomy = {
  categories: [{ id: 'c1', name: 'Druckverfahren', position: 0 }],
  tags: [{ id: 't1', name: 'Farbmessung' }],
} as never;

const base = {
  taxonomy,
  textHits: [],
  formatDate: (d: string) => d,
  displayTitle: (t: string) => t || 'Ohne Titel',
};

describe('Schnellsuche', () => {
  const journals = [
    j('a', 'Farbmessung am Druckbogen', { tagIds: ['t1'] }),
    j('b', 'Plattenwechsel', { categoryIds: ['c1'] }),
    j('c', 'Archiviert Farbe', { status: 'archived' }),
  ];

  it('ohne Eingabe: zuletzt bearbeitet und Befehle', () => {
    const r = buildQuickResults({ ...base, query: '', journals });
    expect(r.filter((i) => i.kind === 'journal').map((i) => i.id)).not.toContain('c');
    expect(r.some((i) => i.kind === 'command' && i.id === 'new-journal')).toBe(true);
  });

  it('findet Journale, Themen und Befehle ohne Umlaut-Sorgen', () => {
    const r = buildQuickResults({ ...base, query: 'farbmessung', journals });
    expect(r[0]).toMatchObject({ kind: 'journal', id: 'a' });
    expect(r.some((i) => i.kind === 'tag' && i.id === 't1')).toBe(true);
    const cmd = buildQuickResults({ ...base, query: 'pdf', journals });
    expect(cmd.map((i) => i.kind === 'command' && i.id)).toContain('export');
  });

  it('Volltext-Treffer ohne Doppelungen mit den Journal-Treffern', () => {
    const textHits = [
      { id: 'a', title: 'x', snippet: null, matchedIn: ['body' as const] },
      {
        id: 'b',
        title: 'Plattenwechsel',
        snippet: { field: 'body' as const, text: `Die ${MARK_START}Rakel${MARK_END} wechseln` },
        matchedIn: ['body' as const],
      },
    ];
    const r = buildQuickResults({ ...base, query: 'farbmessung', journals, textHits });
    const text = r.filter((i) => i.kind === 'text');
    expect(text.map((i) => i.id)).toEqual(['b']);
    expect(text[0]!.detail).toContain('Rakel');
  });
});
