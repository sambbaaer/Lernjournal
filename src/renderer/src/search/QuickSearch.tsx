// Dialog «Schnellsuche» (Strg+K, AJ-26). Bedienung wie die Journal-Auswahl:
// tippen filtert, Pfeil auf/ab wählt, Enter öffnet, Esc schliesst
// (WAI-ARIA-Muster «Combobox» mit Liste; der Fokus bleibt im Suchfeld).
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { BookOpen, FileText, FolderTree, Search, Tag, TerminalSquare, TextSearch } from 'lucide-react';
import { MIN_WORD_LENGTH, parseMarked, type SearchHit } from '@shared/search';
import { displayTitle, formatDate, openLinkedJournal } from '../journal/actions';
import { useApp } from '../state/AppContext';
import { commands } from '../state/commands';
import type { Action, AppState } from '../state/app-state';
import { buildQuickResults, QUICK_GROUP_LABELS, type QuickItem } from './quick-search';

const NO_HITS: SearchHit[] = [];

const ICONS = {
  journal: FileText,
  category: FolderTree,
  tag: Tag,
  text: TextSearch,
  command: TerminalSquare,
} as const;

// Auswahl ausführen (ausserhalb der Komponente: ohne Oberfläche verständlich)
function runItem(item: QuickItem, state: AppState, dispatch: (a: Action) => void) {
  switch (item.kind) {
    case 'journal':
    case 'text':
      void openLinkedJournal(dispatch, item.id);
      return;
    case 'category':
    case 'tag':
      dispatch({
        type: 'fachbuchChanged',
        change: { scope: { kind: item.kind, id: item.id }, query: '' },
      });
      dispatch({ type: 'navigate', view: 'fachbuch' });
      return;
    case 'command':
      switch (item.id) {
        case 'new-journal':
          commands['journal.new'].run(state, dispatch);
          return;
        case 'mcp':
          dispatch({ type: 'showMcp' });
          return;
        case 'archive':
          dispatch({ type: 'openArchive', mode: 'export' });
          return;
        case 'settings':
          dispatch({ type: 'navigate', view: 'einstellungen' });
          return;
        default:
          dispatch({ type: 'navigate', view: item.id });
      }
  }
}

export function QuickSearch() {
  const { state, dispatch } = useApp();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  // Volltext-Treffer mit der Eingabe, zu der sie gehören (veraltete werden ignoriert)
  const [textResult, setTextResult] = useState<{ query: string; hits: SearchHit[] }>({ query: '', hits: [] });
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocus = useRef<Element | null>(null);
  const baseId = useId();
  const close = () => dispatch({ type: 'closeQuickSearch' });

  useEffect(() => {
    returnFocus.current = document.activeElement;
    inputRef.current?.focus();
    return () => (returnFocus.current as HTMLElement | null)?.focus?.();
  }, []);

  // Volltext im Hauptprozess, kurz verzögert (nicht bei jedem Tastendruck).
  // Unter 3 Zeichen findet der Trigramm-Index nichts (ADR 0004).
  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_WORD_LENGTH) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void window.lernjournal.search.query({ query: q, includeArchived: true }).then((res) => {
        if (!cancelled) setTextResult({ query: q, hits: res.ok ? res.data.hits : [] });
      });
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const textHits = textResult.query === query.trim() ? textResult.hits : NO_HITS;
  const results = useMemo(
    () =>
      buildQuickResults({
        query,
        journals: state.journals,
        taxonomy: state.taxonomy,
        textHits,
        formatDate,
        displayTitle,
      }),
    [query, state.journals, state.taxonomy, textHits],
  );
  const index = Math.min(active, Math.max(results.length - 1, 0));
  const current = results[index];
  const optionId = (i: number) => `${baseId}-opt-${i}`;

  useEffect(() => {
    document.getElementById(optionId(index))?.scrollIntoView?.({ block: 'nearest' });
  });

  function choose(item: QuickItem | undefined) {
    if (!item) return;
    close();
    runItem(item, state, dispatch);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(Math.min(index + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(Math.max(index - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(current);
    } else if (e.key === 'Tab') {
      e.preventDefault(); // Modal: einziges Bedienelement ist das Suchfeld
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-black/30 pt-[12vh]"
      onKeyDown={onKeyDown}
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Schnellsuche"
        className="flex max-h-[min(34rem,calc(100vh-8rem))] w-full max-w-2xl flex-col rounded-md bg-surface shadow-xl"
      >
        <div className="relative border-b border-border">
          <Search
            aria-hidden="true"
            size={18}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
          />
          <input
            ref={inputRef}
            type="search"
            role="combobox"
            aria-label="Suchen"
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
            placeholder="Journale, Schlagwörter, Text oder Befehle suchen"
            className="w-full rounded-t-md bg-surface py-3 pl-10 pr-3 text-base placeholder:text-ink-muted focus:outline-none"
          />
        </div>
        <p id={`${baseId}-count`} aria-live="polite" className="sr-only">
          {results.length === 0 ? 'Nichts gefunden.' : `${results.length} Treffer`}
        </p>
        <ul
          id={`${baseId}-list`}
          role="listbox"
          aria-label="Treffer"
          className="min-h-0 flex-1 overflow-y-auto py-1"
        >
          {results.length === 0 && (
            <li role="presentation" className="px-4 py-6 text-center text-sm text-ink-muted">
              Nichts gefunden. Suche im Text braucht mindestens {MIN_WORD_LENGTH} Zeichen.
            </li>
          )}
          {results.map((item, i) => {
            const group = QUICK_GROUP_LABELS[item.kind];
            const newGroup = i === 0 || QUICK_GROUP_LABELS[results[i - 1]!.kind] !== group;
            const Icon = ICONS[item.kind];
            const selected = i === index;
            return [
              newGroup && (
                <li
                  key={`h-${group}`}
                  role="presentation"
                  className="px-4 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-ink-muted"
                >
                  {group}
                </li>
              ),
              <li
                key={`${item.kind}-${item.id}`}
                id={optionId(i)}
                role="option"
                aria-selected={selected}
                onMouseDown={(e) => e.preventDefault()}
                onMouseMove={() => i !== index && setActive(i)}
                onClick={() => choose(item)}
                className={`mx-1 flex cursor-pointer items-center gap-3 rounded-sm border-l-[3px] px-3 py-2 text-sm ${
                  selected ? 'border-accent bg-selected' : 'border-transparent'
                }`}
              >
                <Icon aria-hidden="true" size={16} className="shrink-0 text-ink-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{item.label}</span>
                  <span className="block truncate text-xs text-ink-muted">
                    {item.kind === 'text'
                      ? parseMarked(item.detail).map((seg, k) =>
                          seg.hit ? <mark key={k}>{seg.text}</mark> : <span key={k}>{seg.text}</span>,
                        )
                      : item.detail}
                  </span>
                </span>
              </li>,
            ];
          })}
        </ul>
        <p className="flex items-center gap-2 border-t border-border px-4 py-2 text-xs text-ink-muted">
          <BookOpen aria-hidden="true" size={14} /> Pfeiltasten wählen · Enter öffnet · Esc schliesst
        </p>
      </div>
    </div>
  );
}
