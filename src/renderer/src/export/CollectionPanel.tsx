// Ansicht «Export» → «Mehrere Journale in einem Dokument» (AJ-13, Sammel-DOCX).
//
// Links: Journale auswählen (Suche, Zeitraum, Archiv; Kontrollkästchen).
// Rechts: Reihenfolge im Dokument – Standard chronologisch, mit Auf/Ab
// änderbar. Darüber der Titel der Titelseite. «Als Word exportieren …»
// öffnet denselben Exportdialog wie das Einzel-DOCX (Hinweis R-10 → Speichern
// → Ergebnis), mit Hinweis zum Inhaltsverzeichnis.
//
// Tastatur: alles mit Tab erreichbar, Leertaste kreuzt an. In der Reihenfolge
// verschiebt Alt+Pfeil nach oben/unten das Journal, in dem der Fokus steht;
// der Fokus wandert mit, und die neue Position wird angesagt (aria-live).
// Die Auf/Ab-Knöpfe sind am Rand nur «aria-disabled» statt «disabled» – so
// verliert niemand den Fokus, wenn ein Journal ganz oben ankommt.
//
// Die Zusammenstellung (IDs, Titel) liegt im zentralen Zustand und bleibt beim
// Wechsel der Ansicht erhalten; Filter sind nur hier (wie in der Journalliste).
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowDown, ArrowDownUp, ArrowUp, CalendarRange, Files, Search, X } from 'lucide-react';
import { COLLECTION_LIMITS, DEFAULT_COLLECTION_TITLE } from '@shared/export';
import { displayTitle, formatDate } from '../journal/actions';
import { StatusBadge } from '../journal/StatusBadge';
import { useApp } from '../state/AppContext';
import {
  DEFAULT_COLLECTION_FILTER,
  filterCandidates,
  indexJournals,
  isChronological,
  moveItem,
  pruneSelection,
  rangeInverted,
  selectAll,
  sortChronologically,
  toggleSelection,
  type CollectionFilter,
} from './collection-logic';

const input = 'rounded-sm border border-border-strong bg-surface px-2 py-1.5 text-sm';
// aria-disabled statt disabled: Der Fokus bleibt auf dem Knopf, auch wenn er
// durch den eigenen Klick wirkungslos wird (z. B. nach «Chronologisch sortieren»)
const secondary =
  'flex items-center gap-1.5 rounded-sm border border-border-strong px-3 py-1.5 text-sm hover:bg-hover aria-disabled:cursor-default aria-disabled:opacity-50 aria-disabled:hover:bg-transparent';
const iconButton =
  'rounded-sm p-1.5 hover:bg-hover aria-disabled:cursor-default aria-disabled:opacity-40 aria-disabled:hover:bg-transparent';

type FocusTarget = { id: string; action: 'up' | 'down' | 'remove' } | { id: null };

const countText = (n: number) => (n === 1 ? '1 Journal' : `${n} Journale`);

export function CollectionPanel() {
  const { state, dispatch } = useApp();
  const [filter, setFilter] = useState<CollectionFilter>(DEFAULT_COLLECTION_FILTER);
  // Ansage für Bildschirmleser nach Verschieben/Sortieren
  const [announcement, setAnnouncement] = useState('');
  const orderRef = useRef<HTMLOListElement>(null);
  const orderHeadingRef = useRef<HTMLHeadingElement>(null);
  const pendingFocus = useRef<FocusTarget | null>(null);

  const index = useMemo(() => indexJournals(state.journals), [state.journals]);
  // Nur Journale, die es (noch) gibt – auch wenn der Zustand kurz veraltet ist
  const order = useMemo(() => pruneSelection(state.collection.ids, index), [state.collection.ids, index]);
  const selected = useMemo(() => new Set(order), [order]);

  const categoryName = useMemo(
    () => new Map(state.taxonomy.categories.map((c) => [c.id, c.name])),
    [state.taxonomy.categories],
  );
  const tagName = useMemo(
    () => new Map(state.taxonomy.tags.map((t) => [t.id, t.name])),
    [state.taxonomy.tags],
  );
  const candidates = useMemo(
    () =>
      filterCandidates(state.journals, filter, (j) => [
        ...j.categoryIds.map((id) => categoryName.get(id) ?? ''),
        ...j.tagIds.map((id) => tagName.get(id) ?? ''),
      ]),
    [state.journals, filter, categoryName, tagName],
  );

  const setOrder = (ids: string[]) => dispatch({ type: 'collectionChanged', change: { ids } });

  // Nach dem Verschieben/Entfernen den Fokus an die richtige Stelle setzen
  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    if (target.id === null) {
      orderHeadingRef.current?.focus();
      return;
    }
    const row = orderRef.current?.querySelector<HTMLElement>(`[data-order-id="${target.id}"]`);
    row?.querySelector<HTMLElement>(`[data-action="${target.action}"]`)?.focus();
  }, [order]);

  function move(from: number, delta: number, action: 'up' | 'down') {
    const next = moveItem(order, from, delta);
    if (next.every((id, i) => id === order[i])) return; // schon am Rand
    const id = order[from]!;
    pendingFocus.current = { id, action };
    setOrder(next);
    setAnnouncement(
      `«${displayTitle(index.get(id)?.title ?? '')}» ist jetzt an Position ${from + delta + 1} von ${order.length}.`,
    );
  }

  function remove(from: number) {
    const next = order.filter((_, i) => i !== from);
    // Fokus auf den Nachbarn (gleiche Stelle), sonst auf die Überschrift der Liste
    const neighbour = next[Math.min(from, next.length - 1)];
    pendingFocus.current = neighbour ? { id: neighbour, action: 'remove' } : { id: null };
    setOrder(next);
    setAnnouncement(`«${displayTitle(index.get(order[from]!)?.title ?? '')}» entfernt.`);
  }

  function onRowKeyDown(e: KeyboardEvent, i: number) {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    if (e.key === 'ArrowUp') move(i, -1, 'up');
    else move(i, 1, 'down');
  }

  const tooMany = order.length > COLLECTION_LIMITS.maxJournals;
  const chronological = isChronological(order, index);
  const candidateIds = candidates.map((j) => j.id);
  const allShownSelected = candidateIds.length > 0 && candidateIds.every((id) => selected.has(id));

  return (
    <section
      aria-labelledby="export-collection"
      className="space-y-4 rounded-md border border-border bg-surface p-5"
    >
      <h2 id="export-collection" className="flex items-center gap-2 text-base font-semibold">
        <Files aria-hidden="true" size={18} /> Mehrere Journale in einem Dokument
      </h2>
      <p className="text-sm">
        Mit Titelseite, Inhaltsverzeichnis und jedem Journal auf einer neuen Seite – z. B. für die Besprechung
        mit deiner Berufsbildnerin oder deinem Berufsbildner. Bilder werden durchgehend nummeriert, Links
        zwischen den gewählten Journalen springen im Dokument zum Ziel.
      </p>

      {state.journals.length === 0 ? (
        <p className="text-sm text-ink-muted">Noch keine Journale zum Exportieren.</p>
      ) : (
        <>
          <div className="flex flex-col gap-1 text-sm">
            <label htmlFor="collection-title" className="font-semibold">
              Titel auf der Titelseite
            </label>
            <input
              id="collection-title"
              type="text"
              value={state.collection.title}
              maxLength={COLLECTION_LIMITS.maxTitleLength}
              placeholder={DEFAULT_COLLECTION_TITLE}
              onChange={(e) => dispatch({ type: 'collectionChanged', change: { title: e.target.value } })}
              aria-describedby="collection-title-hint"
              className={`${input} max-w-md placeholder:text-ink-muted`}
            />
            <span id="collection-title-hint" className="text-xs text-ink-muted">
              Leer gelassen: «{DEFAULT_COLLECTION_TITLE}». Name, Lehrbetrieb und Zeitraum ergänzt Lernjournal
              aus deinem Profil und den Journalen.
            </span>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            {/* --- Auswahl --- */}
            <div className="min-w-0 space-y-2" role="group" aria-labelledby="collection-pick">
              <h3 id="collection-pick" className="text-sm font-semibold">
                1. Journale auswählen
              </h3>
              <div className="flex flex-wrap items-end gap-2 text-sm" role="search">
                <div className="relative w-full">
                  <label htmlFor="collection-filter-text" className="sr-only">
                    Journale filtern
                  </label>
                  <Search
                    aria-hidden="true"
                    size={16}
                    className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted"
                  />
                  <input
                    id="collection-filter-text"
                    type="search"
                    value={filter.text}
                    onChange={(e) => setFilter({ ...filter, text: e.target.value })}
                    placeholder="Titel, Kategorie, Schlagwort"
                    className={`${input} w-full pl-8 placeholder:text-ink-muted`}
                  />
                </div>
                <label className="flex flex-col gap-0.5">
                  <span className="flex items-center gap-1 text-xs text-ink-muted">
                    <CalendarRange aria-hidden="true" size={14} /> Arbeitsdatum von
                  </span>
                  <input
                    type="date"
                    value={filter.from}
                    onChange={(e) => setFilter({ ...filter, from: e.target.value })}
                    className={input}
                  />
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className="text-xs text-ink-muted">bis</span>
                  <input
                    type="date"
                    value={filter.to}
                    onChange={(e) => setFilter({ ...filter, to: e.target.value })}
                    className={input}
                  />
                </label>
                <label className="flex items-center gap-2 py-1.5">
                  <input
                    type="checkbox"
                    checked={filter.includeArchived}
                    onChange={(e) => setFilter({ ...filter, includeArchived: e.target.checked })}
                    className="size-4 accent-accent"
                  />
                  Archivierte anzeigen
                </label>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p aria-live="polite" className="text-xs text-ink-muted">
                  {rangeInverted(filter)
                    ? '«von» liegt nach «bis» – bitte den Zeitraum prüfen.'
                    : candidates.length === 0
                      ? 'Kein Journal gefunden.'
                      : `${countText(candidates.length)} angezeigt`}
                </p>
                <button
                  type="button"
                  className={secondary}
                  aria-disabled={candidates.length === 0 || allShownSelected || undefined}
                  onClick={() => {
                    if (allShownSelected) return;
                    setOrder(selectAll(order, candidateIds, index));
                    setAnnouncement(`${countText(candidateIds.length)} ausgewählt.`);
                  }}
                >
                  Alle angezeigten auswählen
                </button>
              </div>
              <ul
                aria-label="Journale zur Auswahl"
                className="max-h-80 divide-y divide-border-subtle overflow-y-auto rounded-sm border border-border"
              >
                {candidates.map((j) => (
                  <li key={j.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-hover">
                      <input
                        type="checkbox"
                        checked={selected.has(j.id)}
                        onChange={() => setOrder(toggleSelection(order, j.id, index))}
                        className="size-4 shrink-0 accent-accent"
                      />
                      <span className={`min-w-0 flex-1 truncate ${j.title.trim() ? '' : 'italic'}`}>
                        {displayTitle(j.title)}
                      </span>
                      <span className="shrink-0 tabular-nums text-ink-muted">{formatDate(j.workDate)}</span>
                      {j.status === 'archived' && <StatusBadge status={j.status} />}
                    </label>
                  </li>
                ))}
              </ul>
            </div>

            {/* --- Reihenfolge --- */}
            <div className="min-w-0 space-y-2" role="group" aria-labelledby="collection-order">
              <h3 id="collection-order" ref={orderHeadingRef} tabIndex={-1} className="text-sm font-semibold">
                2. Reihenfolge im Dokument ({countText(order.length)})
              </h3>
              {order.length === 0 ? (
                <p className="rounded-sm border border-dashed border-border-strong p-4 text-sm text-ink-muted">
                  Noch nichts ausgewählt. Kreuze links die Journale an – sie erscheinen hier nach Arbeitsdatum
                  sortiert.
                </p>
              ) : (
                <>
                  <p id="collection-order-hint" className="text-xs text-ink-muted">
                    Mit den Pfeilen oder Alt+Pfeil nach oben/unten verschieben.
                  </p>
                  <ol
                    ref={orderRef}
                    aria-label="Reihenfolge im Dokument"
                    aria-describedby="collection-order-hint"
                    className="max-h-80 divide-y divide-border-subtle overflow-y-auto rounded-sm border border-border"
                  >
                    {order.map((id, i) => {
                      const j = index.get(id)!;
                      const name = displayTitle(j.title);
                      return (
                        <li
                          key={id}
                          data-order-id={id}
                          onKeyDown={(e) => onRowKeyDown(e, i)}
                          className="flex items-center gap-2 px-3 py-1.5 text-sm"
                        >
                          <span
                            aria-hidden="true"
                            className="w-6 shrink-0 text-right tabular-nums text-ink-muted"
                          >
                            {i + 1}.
                          </span>
                          <span className="min-w-0 flex-1 truncate">{name}</span>
                          <span className="shrink-0 tabular-nums text-ink-muted">
                            {formatDate(j.workDate)}
                          </span>
                          <button
                            type="button"
                            data-action="up"
                            aria-label={`«${name}» nach oben`}
                            title="Nach oben (Alt+Pfeil nach oben)"
                            aria-keyshortcuts="Alt+ArrowUp"
                            aria-disabled={i === 0 || undefined}
                            onClick={() => move(i, -1, 'up')}
                            className={iconButton}
                          >
                            <ArrowUp aria-hidden="true" size={16} />
                          </button>
                          <button
                            type="button"
                            data-action="down"
                            aria-label={`«${name}» nach unten`}
                            title="Nach unten (Alt+Pfeil nach unten)"
                            aria-keyshortcuts="Alt+ArrowDown"
                            aria-disabled={i === order.length - 1 || undefined}
                            onClick={() => move(i, 1, 'down')}
                            className={iconButton}
                          >
                            <ArrowDown aria-hidden="true" size={16} />
                          </button>
                          <button
                            type="button"
                            data-action="remove"
                            aria-label={`«${name}» aus der Auswahl entfernen`}
                            title="Aus der Auswahl entfernen"
                            onClick={() => remove(i)}
                            className={iconButton}
                          >
                            <X aria-hidden="true" size={16} />
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={secondary}
                      aria-disabled={chronological || undefined}
                      onClick={() => {
                        if (chronological) return;
                        setOrder(sortChronologically(order, index));
                        setAnnouncement('Nach Arbeitsdatum sortiert.');
                      }}
                    >
                      <ArrowDownUp aria-hidden="true" size={16} /> Chronologisch sortieren
                    </button>
                    <button
                      type="button"
                      className={secondary}
                      onClick={() => {
                        pendingFocus.current = { id: null };
                        setOrder([]);
                        setAnnouncement('Auswahl geleert.');
                      }}
                    >
                      Auswahl leeren
                    </button>
                  </div>
                </>
              )}
              <p role="status" className="sr-only">
                {announcement}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-border-subtle pt-4">
            <button
              type="button"
              disabled={order.length === 0 || tooMany}
              onClick={() =>
                dispatch({
                  type: 'openExport',
                  journalIds: order,
                  collection: { title: state.collection.title },
                })
              }
              className="rounded-sm bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-strong disabled:cursor-default disabled:opacity-50 disabled:hover:bg-accent"
            >
              Als Word exportieren …
            </button>
            <span className="text-sm text-ink-muted">
              {tooMany
                ? `Höchstens ${COLLECTION_LIMITS.maxJournals} Journale pro Dokument – bitte die Auswahl verkleinern.`
                : order.length === 0
                  ? 'Wähle mindestens ein Journal aus.'
                  : `${countText(order.length)} in dieser Reihenfolge, mit Titelseite und Inhaltsverzeichnis.`}
            </span>
          </div>
        </>
      )}
    </section>
  );
}
