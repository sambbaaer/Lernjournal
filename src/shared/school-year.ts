// Lehrjahr und Semester aus Lehrbeginn und Arbeitsdatum (SPEC «Journal»):
//   Lehrjahr  = volle Jahre seit Lehrbeginn + 1, begrenzt auf 1–4
//   Semester  = 1 in den ersten 6 Monaten des Lehrjahres, sonst 2
// Ohne Lehrbeginn oder bei Arbeitsdatum VOR Lehrbeginn: keine Ableitung (null),
// z. B. Schnupperlehre. Lernende können das Lehrjahr pro Journal überschreiben.
//
// Gerechnet wird mit reinen Kalenderdaten («JJJJ-MM-TT»), ohne Uhrzeit und
// Zeitzone – sonst könnte ein Journal um Mitternacht ins falsche Jahr rutschen.

export type SchoolYear = { year: 1 | 2 | 3 | 4; semester: 1 | 2 };

function parts(iso: string): [number, number, number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export function computeSchoolYear(apprenticeshipStart: string | null, workDate: string): SchoolYear | null {
  if (!apprenticeshipStart) return null;
  const s = parts(apprenticeshipStart);
  const w = parts(workDate);
  if (!s || !w) return null;
  // Volle Monate seit Lehrbeginn (ein angefangener Monat zählt nicht)
  let months = (w[0] - s[0]) * 12 + (w[1] - s[1]);
  if (w[2] < s[2]) months -= 1;
  if (months < 0) return null;
  const year = Math.min(4, Math.floor(months / 12) + 1) as SchoolYear['year'];
  // Nach dem 4. Lehrjahr (z. B. Lehrverlängerung): 4. Lehrjahr, 2. Semester
  if (months >= 48) return { year: 4, semester: 2 };
  const semester = months % 12 < 6 ? 1 : 2;
  return { year, semester };
}

// Wirksames Lehrjahr: manuelle Angabe hat Vorrang vor der Berechnung
export function effectiveSchoolYear(
  apprenticeshipStart: string | null,
  workDate: string,
  override: number | null,
): number | null {
  if (override !== null && override >= 1 && override <= 4) return override;
  return computeSchoolYear(apprenticeshipStart, workDate)?.year ?? null;
}

// Lokales Datum «JJJJ-MM-TT» für «heute» (nicht toISOString – das wäre UTC)
export function localIsoDate(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
