// Dialog «Journal auswählen» (AJ-10): Suche über Titel, Datum, Kategorien und
// Schlagwörter, ohne Rücksicht auf Gross/Klein und Umlaute.
//
// Genutzt für beides:
//  - «Journal verknüpfen …» im Journal (Verknüpfung, in beiden sichtbar)
//  - Menüband «Einfügen → Link zu Journal» (Link im Text)
//
// Bedienung wie ein Office-Suchfeld (Muster «Combobox» der WAI-ARIA):
// tippen filtert, Pfeil auf/ab wählt, Enter übernimmt, Esc bricht ab.
// Der Fokus bleibt im Suchfeld; die gewählte Zeile wird per
// aria-activedescendant angesagt.
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import { filterLinkCandidates } from '@shared/links';
import { useApp } from '../state/AppContext';
import { displayTitle, formatDate } from './actions';
import { StatusBadge } from './StatusBadge';

const MAX_RESULTS = 50; // genügt zum Auswählen; mehr findet man durch genaueres Tippen

export function JournalPicker({
  title,
  confirmLabel,
  excludeIds,
  disabledIds = [],
  disabledHint = 'bereits verknüpft',
  note,
  actions,
  restoreFocus = true,
  onPick,
  onCancel,
}: {
  title: string;
  confirmLabel: string;
  excludeIds: string[]; // erscheinen gar nicht (z. B. das Journal selbst)
  disabledIds?: string[]; // erscheinen, sind aber nicht wählbar (z. B. schon verknüpft)
  disabledHint?: string;
  note?: ReactNode; // Zusatzhinweis unter der Liste
  actions?: ReactNode; // weitere Knöpfe links unten (z. B. «Link entfernen»)
  // Fokus beim Schliessen zurückgeben? Aus beim Editor: Der setzt die
  // Einfügemarke selbst (sonst spränge sie an den Textanfang).
  restoreFocus?: boolean;
  onPick: (journalId: string) => void;
  onCancel: () => void;
}) {
  const { state } = useApp();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocus = useRef<Element | null>(null);
  const baseId = useId();

  // Suchtexte je Journal: Titel + Namen der Kategorien und Schlagwörter
  const candidates = useMemo(() => {
    const exclude = new Set(excludeIds);
    const cat = new Map(state.taxonomy.categories.map((c) => [c.id, c.name]));
    const tag = new Map(state.taxonomy.tags.map((t) => [t.id, t.name]));
    return state.journals
      .filter((j) => !exclude.has(j.id))
      .map((j) => ({
        ...j,
        title: displayTitle(j.title),
        extra: [...j.categoryIds.map((id) => cat.get(id) ?? ''), ...j.tagIds.map((id) => tag.get(id) ?? '')],
      }));
  }, [state.journals, state.taxonomy, excludeIds]);

  const results = useMemo(
    () => filterLinkCandidates(candidates, query).slice(0, MAX_RESULTS),
    [candidates, query],
  );
  const disabled = useMemo(() => new Set(disabledIds), [disabledIds]);
  const index = Math.min(active, Math.max(results.length - 1, 0));
  const current = results[index];
  const optionId = (i: number) => `${baseId}-opt-${i}`;

  useEffect(() => {
    returnFocus.current = document.activeElement;
    inputRef.current?.focus();
    return () => {
      if (restoreFocus) (returnFocus.current as HTMLElement | null)?.focus?.();
    };
  }, [restoreFocus]);

  // Gewählte Zeile sichtbar halten
  useEffect(() => {
    document.getElementById(optionId(index))?.scrollIntoView?.({ block: 'nearest' });
  });

  function pick(id: string | undefined) {
    if (id && !disabled.has(id)) onPick(id);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(Math.min(index + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(Math.max(index - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(current?.id);
    } else if (e.key === 'Tab') {
      // Modal: Fokus bleibt im Dialog (Suchfeld ↔ Knöpfe)
      const focusables = Array.from(
        (e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('input, button:not([disabled])'),
      );
      const i = focusables.indexOf(document.activeElement as HTMLElement);
      const next = e.shiftKey ? i - 1 : i + 1;
      e.preventDefault();
      focusables[(next + focusables.length) % focusables.length]?.focus();
    }
  }

  const empty = state.journals.length <= excludeIds.length;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30" onKeyDown={onKeyDown}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${baseId}-title`}
        className="flex max-h-[min(36rem,calc(100vh-4rem))] w-full max-w-xl flex-col rounded-md bg-surface p-6 shadow-xl"
      >
        <h2 id={`${baseId}-title`} className="text-lg font-semibold">
          {title}
        </h2>
        <div className="relative mt-3">
          <Search
            aria-hidden="true"
            size={16}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted"
          />
          <input
            ref={inputRef}
            type="search"
            role="combobox"
            aria-label="Journal suchen"
            aria-expanded="true"
            aria-controls={`${baseId}-list`}
            aria-autocomplete="list"
            aria-activedescendant={current ? optionId(index) : undefined}
            aria-describedby={`${baseId}-count`}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            placeholder="Titel, Datum, Kategorie oder Schlagwort"
            className="w-full rounded-sm border border-border-strong bg-surface py-2 pl-8 pr-2 text-sm placeholder:text-ink-muted"
          />
        </div>
        <p id={`${baseId}-count`} aria-live="polite" className="mt-2 text-xs text-ink-muted">
          {empty
            ? 'Es gibt noch keine anderen Journale.'
            : results.length === 0
              ? 'Kein Journal gefunden.'
              : `${results.length === MAX_RESULTS ? `Die ersten ${MAX_RESULTS}` : results.length} ${
                  results.length === 1 ? 'Journal' : 'Journale'
                } – Pfeiltasten wählen, Enter übernimmt.`}
        </p>
        <ul
          id={`${baseId}-list`}
          role="listbox"
          aria-label="Gefundene Journale"
          className="mt-2 min-h-0 flex-1 overflow-y-auto rounded-sm border border-border"
        >
          {results.map((j, i) => {
            const isDisabled = disabled.has(j.id);
            const selected = i === index;
            return (
              <li
                key={j.id}
                id={optionId(i)}
                role="option"
                aria-selected={selected}
                aria-disabled={isDisabled ? true : undefined}
                // Klick wählt sofort; mousedown verhindert, dass das Suchfeld den Fokus verliert
                onMouseDown={(e) => e.preventDefault()}
                onMouseMove={() => i !== index && setActive(i)}
                onClick={() => pick(j.id)}
                className={`flex cursor-pointer items-center justify-between gap-3 border-l-[3px] px-3 py-2 text-sm ${
                  selected ? 'border-accent bg-selected' : 'border-transparent'
                } ${isDisabled ? 'cursor-default text-ink-muted' : ''}`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{j.title}</span>
                  <span className="text-xs text-ink-muted">
                    {formatDate(j.workDate)}
                    {isDisabled && ` · ${disabledHint}`}
                  </span>
                </span>
                {j.status !== 'draft' && <StatusBadge status={j.status} />}
              </li>
            );
          })}
        </ul>
        {note && <div className="mt-3 text-xs text-ink-muted">{note}</div>}
        <div className="mt-4 flex justify-between gap-2">
          <div className="flex gap-2">{actions}</div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-sm border border-border-strong px-4 py-2 text-sm hover:bg-hover"
            >
              Abbrechen
            </button>
            <button
              type="button"
              aria-disabled={!current || disabled.has(current.id) ? true : undefined}
              onClick={() => pick(current?.id)}
              className="rounded-sm bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-action-hover aria-disabled:opacity-60"
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
