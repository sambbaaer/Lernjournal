import { describe, expect, it } from 'vitest';
import { computeSchoolYear, effectiveSchoolYear, localIsoDate } from './school-year';

const start = '2025-08-04'; // typischer Lehrbeginn

describe('Lehrjahr/Semester', () => {
  it.each([
    ['2025-08-04', { year: 1, semester: 1 }], // erster Tag
    ['2026-02-03', { year: 1, semester: 1 }], // Tag vor 6 Monaten
    ['2026-02-04', { year: 1, semester: 2 }], // genau 6 Monate
    ['2026-08-03', { year: 1, semester: 2 }], // letzter Tag 1. Lehrjahr
    ['2026-08-04', { year: 2, semester: 1 }], // erster Tag 2. Lehrjahr
    ['2028-08-04', { year: 4, semester: 1 }],
    ['2029-08-03', { year: 4, semester: 2 }], // letzter Tag der Lehre
    ['2029-08-04', { year: 4, semester: 2 }], // danach: begrenzt auf 4
    ['2031-01-01', { year: 4, semester: 2 }],
  ])('Arbeitsdatum %s → %o', (work, expected) => {
    expect(computeSchoolYear(start, work)).toEqual(expected);
  });

  it('vor Lehrbeginn, ohne Lehrbeginn oder bei ungültigem Datum: keine Ableitung', () => {
    expect(computeSchoolYear(start, '2025-08-03')).toBeNull();
    expect(computeSchoolYear(null, '2026-01-01')).toBeNull();
    expect(computeSchoolYear(start, '01.01.2026')).toBeNull();
  });

  it('Lehrbeginn am Monatsende (31.) rechnet mit vollen Monaten', () => {
    expect(computeSchoolYear('2025-01-31', '2025-07-30')).toEqual({ year: 1, semester: 1 });
    expect(computeSchoolYear('2025-01-31', '2025-07-31')).toEqual({ year: 1, semester: 2 });
  });

  it('manuelle Angabe hat Vorrang, ungültige wird ignoriert', () => {
    expect(effectiveSchoolYear(start, '2025-09-01', 3)).toBe(3);
    expect(effectiveSchoolYear(start, '2025-09-01', null)).toBe(1);
    expect(effectiveSchoolYear(start, '2025-09-01', 9)).toBe(1);
    expect(effectiveSchoolYear(null, '2025-09-01', null)).toBeNull();
  });

  it('heute als lokales Datum (nicht UTC)', () => {
    expect(localIsoDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});
