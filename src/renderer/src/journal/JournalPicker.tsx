// Dialog «Journal auswählen» mit Suche (für Verknüpfungen und Links im Text).
// Zugänglich als Combobox: Eingabe filtert, Pfeiltasten wählen, Enter übernimmt.
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Search } from 'lucide-react';
import type { SearchHit } from '@shared/ipc';
import { displayTitle, formatDate } from './actions';

export function JournalPicker({
  title,
  excludeId,
  hint,
  onPick,
  onCancel,
}: {
  title: string;
  excludeId?: string;
  hint?: string;
  onPick: (hit: SearchHit) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  // Suche nach kurzer Tipp-Pause (nicht bei jedem Tastendruck)
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      void window.lernjournal.journal.search({ query, excludeId, limit: 20 }).then((res) => {
        if (cancelled || !res.ok) return;
        setHits(res.data);
        setActive(0);
      });
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, excludeId]);

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, hits.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const hit = hits[active];
      if (hit) onPick(hit);
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-black/30 pt-24"
      onKeyDown={onKeyDown}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="picker-title"
        className="w-full max-w-lg rounded-md bg-surface p-4 shadow-xl"
      >
        <h2 id="picker-title" className="mb-2 text-lg font-semibold">
          {title}
        </h2>
        <div className="relative">
          <Search
            aria-hidden="true"
            size={16}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted"
          />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded={hits.length > 0}
            aria-controls="picker-results"
            aria-activedescendant={hits[active] ? `picker-hit-${hits[active].id}` : undefined}
            aria-autocomplete="list"
            aria-label="Journal suchen"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Titel, Text oder Schlagwort"
            className="w-full rounded-sm border border-border-strong py-2 pl-8 pr-2 text-sm"
          />
        </div>
        <ul
          id="picker-results"
          role="listbox"
          aria-label="Gefundene Journale"
          className="mt-2 max-h-80 overflow-auto"
        >
          {hits.length === 0 && (
            <li className="px-2 py-3 text-sm text-ink-muted" role="presentation">
              {query ? 'Keine passenden Journale.' : 'Keine weiteren Journale.'}
            </li>
          )}
          {hits.map((h, i) => (
            <li
              key={h.id}
              id={`picker-hit-${h.id}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(h)}
              className={`flex cursor-default items-center gap-3 rounded-sm px-2 py-2 text-sm ${i === active ? 'bg-selected' : ''}`}
            >
              <span className={`min-w-0 flex-1 truncate ${h.title.trim() ? '' : 'italic text-ink-muted'}`}>
                {displayTitle(h.title)}
              </span>
              <span className="shrink-0 tabular-nums text-ink-muted">{formatDate(h.workDate)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center justify-between gap-2 text-xs text-ink-muted">
          <span>{hint ?? 'Pfeiltasten wählen, Enter übernimmt, Esc bricht ab.'}</span>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-sm border border-border-strong px-3 py-1.5 text-sm text-ink hover:bg-hover"
          >
            Abbrechen
          </button>
        </div>
      </div>
    </div>
  );
}
