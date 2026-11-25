// Startseite (AJ-24) – reine Logik, ohne Oberfläche testbar.
//
//  - Listen ohne Doppelungen: Was unter «Zuletzt bearbeitet» steht, erscheint
//    nicht noch einmal unter «Offene Entwürfe».
//  - Fortschritt: Journale pro Lehrjahr und Semester, QV-Vormerkungen
//    gegenüber der konfigurierbaren Mindestzahl (nie hart codiert, AGENTS.md).
import type { JournalSummary } from '@shared/journal';
import { computeSchoolYear } from '@shared/school-year';

export const RECENT_COUNT = 5;

export function startLists(journals: readonly JournalSummary[]) {
  const active = journals.filter((j) => j.status !== 'archived');
  const recent = [...active].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, RECENT_COUNT);
  const shown = new Set(recent.map((j) => j.id));
  // Weitere Entwürfe, älteste Bearbeitung zuerst: die bleiben sonst liegen
  const openDrafts = active
    .filter((j) => j.status === 'draft' && !shown.has(j.id))
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
    .slice(0, RECENT_COUNT);
  return { recent, openDrafts };
}

export type YearProgress = {
  year: 1 | 2 | 3 | 4;
  semester1: number;
  semester2: number;
  // Lehrjahr bekannt (z. B. manuell gesetzt), Semester aber nicht
  withoutSemester: number;
  total: number;
};

export type StartProgress = {
  total: number;
  drafts: number;
  completed: number;
  qvSelected: number;
  qvMinimum: number;
  years: YearProgress[];
  // Journale ohne Lehrjahr (kein Lehrbeginn im Profil, Datum davor)
  withoutYear: number;
};

export function startProgress(
  journals: readonly JournalSummary[],
  apprenticeshipStart: string | null,
  qvMinimum: number,
): StartProgress {
  const active = journals.filter((j) => j.status !== 'archived');
  const years: YearProgress[] = ([1, 2, 3, 4] as const).map((year) => ({
    year,
    semester1: 0,
    semester2: 0,
    withoutSemester: 0,
    total: 0,
  }));
  let withoutYear = 0;
  for (const j of active) {
    const year = j.schoolYear; // wirksam: manuell oder berechnet
    if (year === null || year < 1 || year > 4) {
      withoutYear++;
      continue;
    }
    const entry = years[year - 1]!;
    entry.total++;
    // Semester nur, wenn es aus Lehrbeginn und Datum zum wirksamen Lehrjahr passt
    const computed = computeSchoolYear(apprenticeshipStart, j.workDate);
    if (computed && computed.year === year) {
      if (computed.semester === 1) entry.semester1++;
      else entry.semester2++;
    } else entry.withoutSemester++;
  }
  return {
    total: active.length,
    drafts: active.filter((j) => j.status === 'draft').length,
    completed: active.filter((j) => j.status === 'completed').length,
    // Auch archivierte Vormerkungen zählen nicht: Archiv = nicht mehr aktiv
    qvSelected: active.filter((j) => j.qvSelected).length,
    qvMinimum,
    years,
    withoutYear,
  };
}
