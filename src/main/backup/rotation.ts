// Welche Sicherungen bleiben? (AJ-15, SPEC: «letzte 10 + je ein Monatsstand»)
//
// Reine Funktion ohne Dateisystem, damit alle Grenzfälle mit Vitest prüfbar
// sind. Regeln:
//   1. Die neuesten `keepLatest` Sicherungen bleiben immer.
//   2. Zusätzlich je Kalendermonat (Ortszeit, wie Lernende ihn erleben) die
//      NEUESTE Sicherung dieses Monats – also der Stand am Monatsende – für
//      die `keepMonths` neuesten Monate, in denen es Sicherungen gibt.
//   3. `protect` bleibt in jedem Fall: die eben erstellte Sicherung und eine,
//      die gerade wiederhergestellt wird. Wichtig bei verstellter Uhr: Eine
//      neue Sicherung mit Datum in der Vergangenheit wäre sonst «die älteste»
//      und würde gleich wieder gelöscht.
// Reihenfolge nach Zeitpunkt; bei Gleichstand entscheidet die ID (ebenfalls
// ein Zeitstempel, siehe backupIdFor), damit das Ergebnis eindeutig ist.

export type RotationItem = { id: string; createdAt: Date };
export type RotationPolicy = { keepLatest: number; keepMonths: number };

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export function backupsToKeep(
  items: readonly RotationItem[],
  policy: RotationPolicy,
  protect: readonly string[] = [],
): Set<string> {
  const newestFirst = [...items].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id),
  );
  const keep = new Set<string>(protect.filter((id) => items.some((i) => i.id === id)));
  newestFirst.slice(0, Math.max(0, policy.keepLatest)).forEach((i) => keep.add(i.id));

  const months = new Set<string>();
  for (const item of newestFirst) {
    const key = monthKey(item.createdAt);
    if (months.has(key)) continue; // nur die neueste je Monat
    if (months.size >= policy.keepMonths) break;
    months.add(key);
    keep.add(item.id);
  }
  return keep;
}
