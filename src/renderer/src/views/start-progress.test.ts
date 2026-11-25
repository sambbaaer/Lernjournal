// Startseite (AJ-24): keine Doppelungen, Fortschritt pro Semester, QV-Zähler
import { describe, expect, it } from 'vitest';
import type { JournalSummary } from '@shared/journal';
import { startLists, startProgress } from './start-progress';

let n = 0;
const j = (over: Partial<JournalSummary>): JournalSummary => ({
  id: `j${++n}`,
  template: 'report',
  title: 'Journal',
  workDate: '2025-09-01',
  status: 'draft',
  qvSelected: false,
  learningPlace: 'betrieb',
  schoolYear: null,
  schoolYearOverride: null,
  updatedAt: `2026-01-${String(n).padStart(2, '0')}T10:00:00.000Z`,
  completedAt: null,
  categoryIds: [],
  tagIds: [],
  ...over,
});

describe('Startseite', () => {
  it('zeigt jedes Journal nur einmal', () => {
    const journals = Array.from({ length: 8 }, () => j({}));
    const { recent, openDrafts } = startLists(journals);
    expect(recent).toHaveLength(5);
    const ids = [...recent, ...openDrafts].map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Weitere Entwürfe: der am längsten liegengebliebene zuerst
    expect(openDrafts.map((x) => x.id)).toEqual([journals[0]!.id, journals[1]!.id, journals[2]!.id]);
  });

  it('lässt Archiviertes weg', () => {
    const { recent } = startLists([j({ status: 'archived' }), j({ status: 'completed' })]);
    expect(recent.map((x) => x.status)).toEqual(['completed']);
  });

  it('zählt Journale pro Lehrjahr und Semester', () => {
    const start = '2025-08-01';
    const p = startProgress(
      [
        j({ workDate: '2025-09-01', schoolYear: 1 }), // 1. Lj, 1. Sem
        j({ workDate: '2026-03-01', schoolYear: 1 }), // 1. Lj, 2. Sem
        j({ workDate: '2026-09-01', schoolYear: 2, status: 'completed', qvSelected: true }),
        j({ workDate: '2025-09-01', schoolYear: 3, schoolYearOverride: 3 }), // manuell: ohne Semester
        j({ workDate: '2024-01-01', schoolYear: null }), // vor Lehrbeginn
        j({ schoolYear: 1, status: 'archived', qvSelected: true }),
      ],
      start,
      12,
    );
    expect(p.total).toBe(5);
    expect(p.drafts).toBe(4);
    expect(p.completed).toBe(1);
    expect(p.qvSelected).toBe(1);
    expect(p.qvMinimum).toBe(12);
    expect(p.withoutYear).toBe(1);
    expect(p.years[0]).toMatchObject({ semester1: 1, semester2: 1, total: 2 });
    expect(p.years[1]).toMatchObject({ semester1: 1, semester2: 0, total: 1 });
    expect(p.years[2]).toMatchObject({ withoutSemester: 1, total: 1 });
  });
});
