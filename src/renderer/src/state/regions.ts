// F6 springt wie in Office zwischen den Hauptbereichen des Fensters
// (Menüband → Navigation → Dokument → Statusleiste → wieder Menüband).
// Umschalt+F6 springt rückwärts.

export const REGIONS = ['ribbon', 'navigation', 'document', 'statusbar'] as const;
export type Region = (typeof REGIONS)[number];

export function nextRegion(
  current: Region | null,
  backwards: boolean,
  available: readonly Region[] = REGIONS,
): Region {
  const list = REGIONS.filter((r) => available.includes(r));
  if (list.length === 0) throw new Error('Keine Bereiche verfügbar');
  const idx = current ? list.indexOf(current) : -1;
  if (idx === -1) return backwards ? list[list.length - 1]! : list[0]!;
  const step = backwards ? -1 : 1;
  return list[(idx + step + list.length) % list.length]!;
}
