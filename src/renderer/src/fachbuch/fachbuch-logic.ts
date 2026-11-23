// Fachbuch (AJ-11) – reine Logik der Ansicht, ohne Oberfläche testbar.
//
// Das Fachbuch ist eine SICHT auf die Journale (SPEC: keine Kopien). Es
// ordnet sie nach Themen (= Kategorien) und Schlagwörtern und kombiniert das
// mit der Volltextsuche: «Suche nach ‹Rakel› im Thema ‹Siebdruck›».
// Die Volltextsuche selbst läuft im Hauptprozess; hier wird nur noch auf das
// gewählte Thema eingeschränkt – mit den Zuordnungen aus der Journalliste,
// die die Oberfläche ohnehin geladen hat.
import type { JournalSummary } from '@shared/journal';
import type { SearchHit } from '@shared/search';
import type { Taxonomy } from '@shared/taxonomy';

// Welcher Ausschnitt des Fachbuchs ist gewählt?
export type FachbuchScope =
  | { kind: 'all' }
  | { kind: 'category'; id: string }
  | { kind: 'uncategorized' } // «noch einordnen»
  | { kind: 'tag'; id: string };

export type FachbuchState = {
  query: string;
  scope: FachbuchScope;
  includeArchived: boolean;
};

export const INITIAL_FACHBUCH: FachbuchState = { query: '', scope: { kind: 'all' }, includeArchived: false };

export function sameScope(a: FachbuchScope, b: FachbuchScope): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'category' && b.kind === 'category') return a.id === b.id;
  if (a.kind === 'tag' && b.kind === 'tag') return a.id === b.id;
  return true;
}

// Gewählte Kategorie/Schlagwort gibt es nicht mehr (gelöscht, zusammengeführt,
// Schlagwort automatisch entfernt)? → zurück zu «Alle Journale»
export function sanitizeScope(scope: FachbuchScope, taxonomy: Taxonomy): FachbuchScope {
  if (scope.kind === 'category' && !taxonomy.categories.some((c) => c.id === scope.id))
    return { kind: 'all' };
  if (scope.kind === 'tag' && !taxonomy.tags.some((t) => t.id === scope.id)) return { kind: 'all' };
  return scope;
}

export function inScope(j: JournalSummary, scope: FachbuchScope): boolean {
  switch (scope.kind) {
    case 'all':
      return true;
    case 'category':
      return j.categoryIds.includes(scope.id);
    case 'uncategorized':
      return j.categoryIds.length === 0;
    case 'tag':
      return j.tagIds.includes(scope.id);
  }
}

// Archivierte Journale gehören nur auf Wunsch ins Fachbuch
export function visibleJournals(journals: readonly JournalSummary[], includeArchived: boolean) {
  return includeArchived ? [...journals] : journals.filter((j) => j.status !== 'archived');
}

export function scopeLabel(scope: FachbuchScope, taxonomy: Taxonomy): string {
  switch (scope.kind) {
    case 'all':
      return 'Alle Journale';
    case 'uncategorized':
      return 'Ohne Kategorie';
    case 'category':
      return taxonomy.categories.find((c) => c.id === scope.id)?.name ?? 'Kategorie';
    case 'tag':
      return `Schlagwort «${taxonomy.tags.find((t) => t.id === scope.id)?.name ?? ''}»`;
  }
}

export type TopicEntry = { id: string; name: string; count: number };

// Themen (alle Kategorien in ihrer Reihenfolge, auch leere – sie zeigen,
// welche Bereiche noch fehlen) und Schlagwörter (nur benutzte, alphabetisch).
// Gezählt werden die sichtbaren Journale (ohne Archiv, falls ausgeblendet).
export function topicOverview(visible: readonly JournalSummary[], taxonomy: Taxonomy) {
  const catCount = new Map<string, number>();
  const tagCount = new Map<string, number>();
  let uncategorized = 0;
  for (const j of visible) {
    if (j.categoryIds.length === 0) uncategorized++;
    for (const id of j.categoryIds) catCount.set(id, (catCount.get(id) ?? 0) + 1);
    for (const id of j.tagIds) tagCount.set(id, (tagCount.get(id) ?? 0) + 1);
  }
  return {
    total: visible.length,
    categories: taxonomy.categories.map((c) => ({ id: c.id, name: c.name, count: catCount.get(c.id) ?? 0 })),
    uncategorized,
    tags: taxonomy.tags
      .map((t) => ({ id: t.id, name: t.name, count: tagCount.get(t.id) ?? 0 }))
      .filter((t) => t.count > 0),
  };
}

// «Verwandte» Schlagwörter: die häufigsten Schlagwörter der Journale im
// gewählten Ausschnitt (ohne das gewählte Schlagwort selbst). Führt von einem
// Thema zu verwandten Journalen, ohne dass Lernende etwas pflegen müssen.
export function relatedTags(
  inScopeJournals: readonly JournalSummary[],
  scope: FachbuchScope,
  taxonomy: Taxonomy,
  limit = 8,
): TopicEntry[] {
  if (scope.kind === 'all') return [];
  const count = new Map<string, number>();
  for (const j of inScopeJournals)
    for (const id of j.tagIds)
      if (!(scope.kind === 'tag' && scope.id === id)) count.set(id, (count.get(id) ?? 0) + 1);
  return taxonomy.tags
    .filter((t) => count.has(t.id))
    .map((t) => ({ id: t.id, name: t.name, count: count.get(t.id)! }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'de-CH'))
    .slice(0, limit);
}

export type FachbuchItem = { journal: JournalSummary; hit: SearchHit | null };

// Einträge der Ansicht. Ohne Suchbegriff: alle Journale im Ausschnitt
// (neuestes Arbeitsdatum zuerst, wie die Journalliste). Mit Suchbegriff: die
// Treffer im Ausschnitt in der Reihenfolge der Suche (beste zuerst), dazu die
// Anzahl Treffer ausserhalb («3 weitere Treffer in anderen Themen»).
export function fachbuchItems(
  visible: readonly JournalSummary[],
  scope: FachbuchScope,
  hits: readonly SearchHit[] | null,
): { items: FachbuchItem[]; outsideScope: number } {
  if (!hits) {
    return {
      items: visible.filter((j) => inScope(j, scope)).map((journal) => ({ journal, hit: null })),
      outsideScope: 0,
    };
  }
  const byId = new Map(visible.map((j) => [j.id, j]));
  const items: FachbuchItem[] = [];
  let outsideScope = 0;
  for (const hit of hits) {
    const journal = byId.get(hit.id);
    if (!journal) continue; // z. B. eben gelöscht oder archiviert
    if (inScope(journal, scope)) items.push({ journal, hit });
    else outsideScope++;
  }
  return { items, outsideScope };
}

// «1 Journal», «3 Journale», «1 Treffer»
export function countLabel(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
