// Querverweise «[[…]]» (AJ-27) – reine Logik, ohne Oberfläche testbar.
import type { JournalSummary } from '@shared/journal';
import { filterLinkCandidates, journalLinkHref, searchKey, tagLinkHref } from '@shared/links';
import type { Merkstelle } from '@shared/merkstellen';
import type { Taxonomy } from '@shared/taxonomy';

export type CrossRefItem =
  | { kind: 'journal'; id: string; journalId: string; label: string; detail: string; linkText: string }
  | { kind: 'tag'; id: string; label: string; detail: string; linkText: string }
  | { kind: 'merkstelle'; id: string; journalId: string; label: string; detail: string; linkText: string };

const MAX_PER_GROUP = 8;

function matches(text: string, query: string): boolean {
  const words = searchKey(query).split(' ').filter(Boolean);
  const hay = searchKey(text);
  return words.every((w) => hay.includes(w));
}

export function crossRefCandidates(input: {
  query: string;
  journals: readonly JournalSummary[];
  tags: Taxonomy['tags'];
  merkstellen: readonly Merkstelle[];
  excludeJournalId: string | null;
  displayTitle: (t: string) => string;
  formatDate: (iso: string) => string;
}): CrossRefItem[] {
  const { query, journals, tags, merkstellen, excludeJournalId, displayTitle, formatDate } = input;
  const candidates = journals
    .filter((j) => j.id !== excludeJournalId && j.status !== 'archived')
    .map((j) => ({ ...j, title: displayTitle(j.title), extra: [] as string[] }));
  const journalItems: CrossRefItem[] = filterLinkCandidates(candidates, query)
    .slice(0, MAX_PER_GROUP)
    .map((j) => ({
      kind: 'journal',
      id: j.id,
      journalId: j.id,
      label: j.title,
      detail: formatDate(j.workDate),
      linkText: j.title,
    }));
  const tagItems: CrossRefItem[] = tags
    .filter((t) => matches(t.name, query))
    .slice(0, MAX_PER_GROUP)
    .map((t) => ({
      kind: 'tag',
      id: t.id,
      label: t.name,
      detail: 'Themenansicht im Fachbuch',
      linkText: t.name,
    }));
  const merkItems: CrossRefItem[] = merkstellen
    .filter((m) => m.journalId !== excludeJournalId && matches(`${m.term} ${m.text}`, query))
    .slice(0, MAX_PER_GROUP)
    .map((m) => ({
      kind: 'merkstelle',
      id: m.id,
      journalId: m.journalId,
      label: m.term,
      detail: `in «${displayTitle(m.journalTitle)}»`,
      linkText: m.term,
    }));
  return [...journalItems, ...tagItems, ...merkItems];
}

// Getipptes «[[Begriff]]» auflösen (ohne Auswahl): exakter Treffer auf
// Schlagwort, Merkstelle oder Journaltitel (ohne Gross/Klein und Akzente).
// Liefert das Link-Ziel oder null (dann bleibt der Text, wie er ist).
export function resolveTypedCrossRef(
  term: string,
  input: {
    journals: readonly JournalSummary[];
    tags: Taxonomy['tags'];
    merkstellen: readonly Merkstelle[];
    excludeJournalId: string | null;
  },
): string | null {
  const key = searchKey(term);
  if (!key) return null;
  const tag = input.tags.find((t) => searchKey(t.name) === key);
  if (tag) return tagLinkHref(tag.id);
  const merk = input.merkstellen.find(
    (m) => searchKey(m.term) === key && m.journalId !== input.excludeJournalId,
  );
  if (merk) return journalLinkHref(merk.journalId);
  const journal = input.journals.find(
    (j) => j.id !== input.excludeJournalId && searchKey(j.title) === key && j.status !== 'archived',
  );
  return journal ? journalLinkHref(journal.id) : null;
}
