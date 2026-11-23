// Fachbuch (SPEC «Navigation»): eine Sicht über dieselben Journale – keine Kopien.
//  - Mit Suchbegriff: Volltextsuche (Titel, Text, Bildlegenden, Schlagwörter)
//  - Ohne Suchbegriff: Themenansicht nach Kategorie oder Schlagwort
import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, FolderTree, Search, Tags } from 'lucide-react';
import type { SearchResult } from '@shared/ipc';
import type { JournalSummary } from '@shared/journal';
import { displayTitle, formatDate, openJournal } from '../journal/actions';
import { StatusBadge } from '../journal/StatusBadge';
import { useApp } from '../state/AppContext';
import { EmptyState } from '../views/EmptyState';
import { Highlight } from './Highlight';

type Mode = 'kategorien' | 'schlagwoerter';

function JournalRows({ items }: { items: JournalSummary[] }) {
  const { dispatch } = useApp();
  return (
    <ul className="divide-y divide-border-subtle">
      {items.map((j) => (
        <li key={j.id}>
          <button
            type="button"
            onClick={() => void openJournal(dispatch, j.id)}
            className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-hover"
          >
            <span className={`min-w-0 flex-1 truncate ${j.title.trim() ? '' : 'italic text-ink-muted'}`}>
              {displayTitle(j.title)}
            </span>
            <span className="shrink-0 tabular-nums text-ink-muted">{formatDate(j.workDate)}</span>
            <StatusBadge status={j.status} />
          </button>
        </li>
      ))}
    </ul>
  );
}

export function FachbuchView() {
  const { state, dispatch } = useApp();
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [mode, setMode] = useState<Mode>('kategorien');

  // Strg+Umschalt+F: Fokus ins Suchfeld, sobald die Ansicht da ist
  useEffect(() => {
    if (state.focusRequest === 'fachbuch-search') {
      searchRef.current?.focus();
      dispatch({ type: 'requestFocus', target: null });
    }
  }, [state.focusRequest, dispatch]);

  // Suchen nach kurzer Tipp-Pause
  useEffect(() => {
    if (!query.trim()) return;
    let cancelled = false;
    const t = setTimeout(() => {
      void window.lernjournal.search.query({ query }).then((res) => {
        if (!cancelled) setResults(res.ok ? res.data : []);
      });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  // Ohne Suchbegriff keine Trefferliste (abgeleitet statt im Effekt zurückgesetzt)
  const shownResults = query.trim() ? results : null;

  const active = useMemo(() => state.journals.filter((j) => j.status !== 'archived'), [state.journals]);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-8 py-6">
      <h1 className="text-2xl font-semibold">Fachbuch</h1>
      <div role="search" className="relative max-w-xl">
        <label htmlFor="fachbuch-search" className="sr-only">
          Im Fachbuch suchen
        </label>
        <Search
          aria-hidden="true"
          size={18}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
        />
        <input
          ref={searchRef}
          id="fachbuch-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Im Fachbuch suchen, z. B. «Farbmessung»"
          className="w-full rounded-sm border border-border-strong bg-surface py-2 pl-10 pr-3 text-sm placeholder:text-ink-muted"
        />
      </div>

      {shownResults !== null ? (
        <section aria-labelledby="fb-results">
          <h2 id="fb-results" className="mb-2 text-base font-semibold" aria-live="polite">
            {shownResults.length === 0
              ? 'Keine Treffer'
              : `${shownResults.length} ${shownResults.length === 1 ? 'Treffer' : 'Treffer'}`}
          </h2>
          {shownResults.length > 0 && (
            <ul
              className="divide-y divide-border-subtle rounded-md border border-border bg-surface"
              aria-label="Suchergebnisse"
            >
              {shownResults.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => void openJournal(dispatch, r.id)}
                    className="block w-full px-4 py-3 text-left hover:bg-hover"
                  >
                    <span className="flex items-center gap-3">
                      <span className="min-w-0 flex-1 truncate font-semibold">
                        <Highlight text={r.title.trim() ? r.title : 'Ohne Titel'} />
                      </span>
                      <span className="shrink-0 text-sm tabular-nums text-ink-muted">
                        {formatDate(r.workDate)}
                      </span>
                      <StatusBadge status={r.status} />
                    </span>
                    {r.snippet.trim() && (
                      <span className="mt-1 block text-sm text-ink-muted">
                        <Highlight text={r.snippet} />
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : active.length === 0 ? (
        <EmptyState icon={BookOpen} title="Dein persönliches Fachbuch">
          Alle Journale, geordnet nach Themen und Schlagwörtern und durchsuchbar – ohne doppelte Inhalte.
          Während der IPA darfst du deine Lerndokumentation als Hilfsmittel verwenden.
        </EmptyState>
      ) : (
        <section aria-labelledby="fb-themes" className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 id="fb-themes" className="text-base font-semibold">
              Themen
            </h2>
            <div
              role="radiogroup"
              aria-label="Ordnen nach"
              className="flex rounded-sm border border-border-strong text-sm"
            >
              {(
                [
                  ['kategorien', 'Nach Kategorie', FolderTree],
                  ['schlagwoerter', 'Nach Schlagwort', Tags],
                ] as const
              ).map(([m, label, Icon]) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => setMode(m)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 ${mode === m ? 'bg-selected font-semibold' : 'hover:bg-hover'}`}
                >
                  <Icon aria-hidden="true" size={15} /> {label}
                </button>
              ))}
            </div>
          </div>
          {mode === 'kategorien' ? <ByCategory journals={active} /> : <ByTag journals={active} />}
        </section>
      )}
    </div>
  );
}

function Group({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <details open className="rounded-md border border-border bg-surface">
      <summary className="cursor-pointer px-4 py-2 font-semibold">
        {title} <span className="font-normal text-ink-muted">({count})</span>
      </summary>
      <div className="border-t border-border-subtle">{children}</div>
    </details>
  );
}

function ByCategory({ journals }: { journals: JournalSummary[] }) {
  const { state } = useApp();
  const groups = state.categories
    .map((c) => ({ c, items: journals.filter((j) => j.categoryIds.includes(c.id)) }))
    .filter((g) => g.items.length > 0);
  const without = journals.filter((j) => j.categoryIds.length === 0);
  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <Group key={g.c.id} title={g.c.name} count={g.items.length}>
          <JournalRows items={g.items} />
        </Group>
      ))}
      {without.length > 0 && (
        <Group title="Ohne Kategorie" count={without.length}>
          <JournalRows items={without} />
        </Group>
      )}
    </div>
  );
}

function ByTag({ journals }: { journals: JournalSummary[] }) {
  const { state } = useApp();
  const groups = state.tags
    .map((t) => ({ t, items: journals.filter((j) => j.tagIds.includes(t.id)) }))
    .filter((g) => g.items.length > 0);
  if (groups.length === 0) return <p className="text-sm text-ink-muted">Noch keine Schlagwörter vergeben.</p>;
  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <Group key={g.t.id} title={g.t.name} count={g.items.length}>
          <JournalRows items={g.items} />
        </Group>
      ))}
    </div>
  );
}
