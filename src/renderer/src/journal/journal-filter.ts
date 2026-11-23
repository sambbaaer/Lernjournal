// Filter der Journalliste – reine Logik, ohne Oberfläche testbar.
// SPEC «Navigation»: Filter nach Status, Kategorie und Schlagwort (AJ-09);
// Lehrjahr/Semester/Lernort folgen bei Bedarf nach dem Pilot.
import type { JournalSummary } from '@shared/journal';

export type StatusFilter = 'active' | 'draft' | 'completed' | 'archived';

// 'all' = kein Filter; 'none' = Journale ohne jede Kategorie («noch einordnen»)
export type CategoryFilter = 'all' | 'none' | string;
export type TagFilter = 'all' | string;

export type JournalFilter = {
  status: StatusFilter;
  text: string;
  category: CategoryFilter;
  tag: TagFilter;
};

export const DEFAULT_FILTER: JournalFilter = { status: 'active', text: '', category: 'all', tag: 'all' };

export function matchesFilter(j: JournalSummary, f: JournalFilter): boolean {
  const statusOk = f.status === 'active' ? j.status !== 'archived' : j.status === f.status;
  if (!statusOk) return false;
  const q = f.text.trim().toLocaleLowerCase('de-CH');
  if (q && !j.title.toLocaleLowerCase('de-CH').includes(q)) return false;
  if (f.category === 'none' && j.categoryIds.length > 0) return false;
  if (f.category !== 'all' && f.category !== 'none' && !j.categoryIds.includes(f.category)) return false;
  if (f.tag !== 'all' && !j.tagIds.includes(f.tag)) return false;
  return true;
}

// Filter zeigt auf eine Kategorie/ein Schlagwort, das es nicht mehr gibt
// (gelöscht, zusammengeführt)? Dann auf «Alle» zurück statt leerer Liste.
export function sanitizeFilter(
  f: JournalFilter,
  categoryIds: readonly string[],
  tagIds: readonly string[],
): JournalFilter {
  const category =
    f.category === 'all' || f.category === 'none' || categoryIds.includes(f.category) ? f.category : 'all';
  const tag = f.tag === 'all' || tagIds.includes(f.tag) ? f.tag : 'all';
  return category === f.category && tag === f.tag ? f : { ...f, category, tag };
}
