// Zusammenstellung für das Sammel-DOCX (AJ-13) – reine Logik ohne React,
// damit Auswahl, Filter und Reihenfolge mit Vitest prüfbar sind.
//
// Grundsätze:
//  - Standard ist chronologisch (nach Arbeitsdatum, ältestes zuerst): Wer ein
//    Journal ankreuzt, findet es an seiner zeitlichen Stelle in der
//    Reihenfolge – ohne danach sortieren zu müssen.
//  - Danach ist die Reihenfolge frei änderbar (Auf/Ab); «Chronologisch
//    sortieren» stellt den Standard wieder her.
//  - Die Auswahl besteht nur aus Journal-IDs. Was es nicht mehr gibt (gelöscht),
//    fällt still weg – im Dokument erscheint nie ein Journal, das man nicht sieht.
import type { JournalSummary } from '@shared/journal';
import { filterLinkCandidates } from '@shared/links';

type Sortable = Pick<JournalSummary, 'id' | 'title' | 'workDate'>;

// Arbeitsdatum aufsteigend; bei gleichem Datum nach Titel, dann ID – so ist
// die Reihenfolge immer eindeutig und damit stabil.
export function compareChronological(a: Sortable, b: Sortable): number {
  return (
    a.workDate.localeCompare(b.workDate) ||
    a.title.localeCompare(b.title, 'de-CH', { sensitivity: 'base' }) ||
    a.id.localeCompare(b.id)
  );
}

// --- Filter der Auswahlliste ------------------------------------------------

// Zeitraum: SPEC «Besprechung mit Berufsbildner/in» – im MVP über den
// normalen Sammel-Export mit Filter nach Zeitraum. Leere Grenze = offen.
export type CollectionFilter = {
  text: string; // Titel, Datum, Kategorien, Schlagwörter (wie «Journal auswählen»)
  from: string; // ISO-Datum oder ''
  to: string; // ISO-Datum oder ''
  includeArchived: boolean;
};
export const DEFAULT_COLLECTION_FILTER: CollectionFilter = {
  text: '',
  from: '',
  to: '',
  includeArchived: false,
};

// Gefilterte Journale, chronologisch. extra = weitere Suchtexte je Journal
// (Namen der Kategorien und Schlagwörter), damit die Suche dieselben Treffer
// liefert wie der Dialog «Journal auswählen».
export function filterCandidates(
  journals: readonly JournalSummary[],
  filter: CollectionFilter,
  extra: (j: JournalSummary) => string[] = () => [],
): JournalSummary[] {
  const inRange = journals.filter(
    (j) =>
      (filter.includeArchived || j.status !== 'archived') &&
      (!filter.from || j.workDate >= filter.from) &&
      (!filter.to || j.workDate <= filter.to),
  );
  const found = filterLinkCandidates(
    inRange.map((j) => ({ ...j, extra: extra(j) })),
    filter.text,
  );
  return found.sort(compareChronological);
}

// Zeitraum verkehrt herum eingegeben? Dann findet der Filter nichts – die
// Oberfläche sagt warum, statt still eine leere Liste zu zeigen.
export function rangeInverted(filter: CollectionFilter): boolean {
  return Boolean(filter.from && filter.to && filter.from > filter.to);
}

// --- Auswahl und Reihenfolge ------------------------------------------------

export type JournalIndex = ReadonlyMap<string, Sortable>;

export function indexJournals(journals: readonly Sortable[]): Map<string, Sortable> {
  return new Map(journals.map((j) => [j.id, j]));
}

// Journal an seiner chronologischen Stelle einfügen: vor dem ersten bereits
// gewählten Journal, das später ist. Hat jemand die Reihenfolge von Hand
// geändert, bleibt diese erhalten; das neue Journal kommt an eine sinnvolle Stelle.
export function insertChronologically(order: readonly string[], id: string, index: JournalIndex): string[] {
  if (order.includes(id)) return [...order];
  const j = index.get(id);
  if (!j) return [...order];
  const at = order.findIndex((other) => {
    const o = index.get(other);
    return o !== undefined && compareChronological(o, j) > 0;
  });
  return at < 0 ? [...order, id] : [...order.slice(0, at), id, ...order.slice(at)];
}

// Ankreuzen/Abwählen in der Auswahlliste
export function toggleSelection(order: readonly string[], id: string, index: JournalIndex): string[] {
  return order.includes(id) ? order.filter((x) => x !== id) : insertChronologically(order, id, index);
}

// «Alle angezeigten auswählen»: fehlende chronologisch dazu, gewählte bleiben, wo sie sind
export function selectAll(order: readonly string[], ids: readonly string[], index: JournalIndex): string[] {
  return ids.reduce<string[]>((acc, id) => insertChronologically(acc, id, index), [...order]);
}

// Eintrag um delta Plätze verschieben (−1 = nach oben). Am Rand: unverändert.
export function moveItem(order: readonly string[], from: number, delta: number): string[] {
  const to = from + delta;
  if (from < 0 || from >= order.length || to < 0 || to >= order.length || delta === 0) return [...order];
  const next = [...order];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

export function sortChronologically(order: readonly string[], index: JournalIndex): string[] {
  return [...order].sort((a, b) => {
    const ja = index.get(a);
    const jb = index.get(b);
    return ja && jb ? compareChronological(ja, jb) : 0;
  });
}

export function isChronological(order: readonly string[], index: JournalIndex): boolean {
  return sortChronologically(order, index).every((id, i) => id === order[i]);
}

// Nur Journale, die es (noch) gibt – in unveränderter Reihenfolge
export function pruneSelection(order: readonly string[], index: JournalIndex): string[] {
  return order.filter((id) => index.has(id));
}
