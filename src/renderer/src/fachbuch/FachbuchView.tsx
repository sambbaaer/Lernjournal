// Fachbuch (AJ-11): persönliches Nachschlagewerk über alle Journale.
//
// Links die Themen (Kategorien) und Schlagwörter, rechts die Journale des
// gewählten Ausschnitts. Mit einem Suchbegriff werden daraus Treffer mit
// markiertem Textausschnitt. Alles sind nur Verweise auf die Journale – ein
// Klick öffnet das Journal selbst (SPEC: keine Kopien).
//
// Tastatur: Strg+Umschalt+F springt ins Suchfeld, Pfeil runter zu den
// Treffern, Pfeiltasten wandern darin, Enter öffnet, Esc leert das Suchfeld.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { BookOpen, Search, SearchX } from 'lucide-react';
import {
  MIN_WORD_LENGTH,
  SEARCH_FIELD_LABELS,
  parseMarked,
  searchableWords,
  type SearchHit,
  type SearchResult,
} from '@shared/search';
import { useApp } from '../state/AppContext';
import { displayTitle, formatDate, openJournal } from '../journal/actions';
import { StatusBadge } from '../journal/StatusBadge';
import { handleRovingKeys } from '../shell/roving';
import { EmptyState } from '../views/EmptyState';
import { ViewFrame } from '../views/Views';
import type { Merkstelle } from '@shared/merkstellen';
import { MerkstellenList } from './MerkstellenList';
import {
  countLabel,
  fachbuchItems,
  filterMerkstellen,
  relatedTags,
  sameScope,
  sanitizeScope,
  scopeLabel,
  topicOverview,
  visibleJournals,
  type FachbuchItem,
  type FachbuchScope,
} from './fachbuch-logic';

// Kurze Pause nach dem letzten Tastendruck, bevor gesucht wird
const SEARCH_DELAY_MS = 150;
const NO_HITS: SearchHit[] = [];

// Text mit markierten Treffern. Die Markierung kommt als Steuerzeichen aus
// dem Hauptprozess und wird hier zu <mark> – nie als HTML eingesetzt.
function Marked({ text }: { text: string }) {
  return (
    <>
      {parseMarked(text).map((s, i) =>
        s.hit ? (
          <mark key={i} className="rounded-sm bg-highlight text-ink">
            {s.text}
          </mark>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}

function TopicButton({
  scope,
  current,
  label,
  count,
  onSelect,
}: {
  scope: FachbuchScope;
  current: FachbuchScope;
  label: string;
  count: number;
  onSelect: (s: FachbuchScope) => void;
}) {
  const selected = sameScope(scope, current);
  return (
    <button
      type="button"
      aria-current={selected ? 'true' : undefined}
      onClick={() => onSelect(scope)}
      title={label}
      // Auswahl zusätzlich mit Balken links (Windows-Kontrastmodus)
      className={`flex w-full items-center gap-2 border-l-[3px] px-2 py-1.5 text-left text-sm ${
        selected ? 'border-accent bg-selected font-semibold' : 'border-transparent hover:bg-hover'
      }`}
    >
      <span className={`min-w-0 flex-1 truncate ${count === 0 && !selected ? 'text-ink-muted' : ''}`}>
        {label}
      </span>
      <span className="shrink-0 tabular-nums text-ink-muted">
        {count}
        <span className="sr-only"> {count === 1 ? 'Journal' : 'Journale'}</span>
      </span>
    </button>
  );
}

function ResultEntry({
  item,
  names,
  tabbable,
  onFocus,
}: {
  item: FachbuchItem;
  names: { category: Map<string, string>; tag: Map<string, string> };
  tabbable: boolean;
  onFocus: () => void;
}) {
  const { dispatch } = useApp();
  const { journal: j, hit } = item;
  const assigned = [
    ...j.categoryIds.map((id) => names.category.get(id)),
    ...j.tagIds.map((id) => names.tag.get(id)),
  ].filter(Boolean);
  const title = hit?.title.trim() ? hit.title : j.title;
  return (
    <li>
      <button
        type="button"
        data-result
        tabIndex={tabbable ? 0 : -1}
        onFocus={onFocus}
        onClick={() => void openJournal(dispatch, j.id)}
        className="block w-full px-4 py-3 text-left hover:bg-hover"
      >
        <span className="flex items-baseline gap-3">
          <span className={`min-w-0 flex-1 ${title.trim() ? 'font-semibold' : 'italic text-ink-muted'}`}>
            {title.trim() ? <Marked text={title} /> : displayTitle(title)}
          </span>
          <span className="shrink-0 text-sm tabular-nums text-ink-muted">{formatDate(j.workDate)}</span>
          <StatusBadge status={j.status} />
        </span>
        {hit?.snippet && (
          <span className="mt-1 block text-sm leading-relaxed">
            {hit.snippet.field === 'captions' && <span className="text-ink-muted">Bildlegende: </span>}
            <Marked text={hit.snippet.text} />
          </span>
        )}
        {(assigned.length > 0 || hit) && (
          <span className="mt-1 block text-xs text-ink-muted">
            {assigned.length > 0 && (
              <>
                <span className="sr-only">Zuordnungen: </span>
                {assigned.join(' · ')}
              </>
            )}
            {assigned.length > 0 && hit && ' – '}
            {hit && `Gefunden in: ${hit.matchedIn.map((f) => SEARCH_FIELD_LABELS[f]).join(', ')}`}
          </span>
        )}
      </button>
    </li>
  );
}

export function FachbuchView() {
  const { state, dispatch } = useApp();
  const { query, includeArchived } = state.fachbuch;
  const { taxonomy } = state;
  const scope = sanitizeScope(state.fachbuch.scope, taxonomy);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const change = (c: Partial<typeof state.fachbuch>) => dispatch({ type: 'fachbuchChanged', change: c });

  // Strg+Umschalt+F: Fokus ins Suchfeld, sobald die Ansicht da ist
  useEffect(() => {
    if (state.focusRequest === 'fachbuch-search') {
      searchRef.current?.focus();
      searchRef.current?.select();
      dispatch({ type: 'requestFocus', target: null });
    }
  }, [state.focusRequest, dispatch]);

  // Merkstellen (AJ-33): bei jeder Änderung der Journalliste frisch laden
  const [merkstellen, setMerkstellen] = useState<Merkstelle[]>([]);
  useEffect(() => {
    let cancelled = false;
    void window.lernjournal.search.merkstellen().then((res) => {
      if (!cancelled && res.ok) setMerkstellen(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [state.journals]);
  const showMerkstellen = scope.kind === 'merkstellen';
  const shownMerkstellen = useMemo(
    () => filterMerkstellen(merkstellen, showMerkstellen ? query : '', includeArchived),
    [merkstellen, query, includeArchived, showMerkstellen],
  );
  const merkCount = useMemo(
    () => filterMerkstellen(merkstellen, '', includeArchived).length,
    [merkstellen, includeArchived],
  );

  // Volltextsuche im Hauptprozess, kurz nach dem letzten Tastendruck. Eine
  // spätere Eingabe verwirft die Antwort einer früheren (kein Wettlauf).
  // Nur Wörter mit mind. 3 Zeichen sind suchbar (Trigramm-Index). Solange
  // keines dabei ist, bleibt die Übersicht stehen, statt «0 Treffer» zu zeigen.
  // In den Merkstellen filtert die Eingabe die Liste (keine Volltextsuche)
  const trimmed = !showMerkstellen && searchableWords(query).length > 0 ? query.trim() : '';
  const tooShort = trimmed === '' && query.trim() !== '';
  const [result, setResult] = useState<{ key: string; data: SearchResult } | null>(null);
  const [failed, setFailed] = useState(false);
  const searchKey = `${includeArchived ? 1 : 0}:${trimmed}`;
  useEffect(() => {
    if (!trimmed) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const res = await window.lernjournal.search
        .query({ query: trimmed, includeArchived })
        .catch(() => null);
      if (cancelled) return;
      if (res?.ok) {
        setResult({ key: searchKey, data: res.data });
        setFailed(false);
      } else {
        setFailed(true);
      }
    }, SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmed, includeArchived, searchKey]);
  // Bis die Antwort da ist, bleiben die bisherigen Treffer stehen (kein Flackern)
  const hits = trimmed ? (result?.data.hits ?? NO_HITS) : null;
  const pending = trimmed !== '' && result?.key !== searchKey && !failed;

  const visible = useMemo(
    () => visibleJournals(state.journals, includeArchived),
    [state.journals, includeArchived],
  );
  const overview = useMemo(() => topicOverview(visible, taxonomy), [visible, taxonomy]);
  const { items, outsideScope } = useMemo(() => fachbuchItems(visible, scope, hits), [visible, scope, hits]);
  const related = useMemo(
    () =>
      hits
        ? []
        : relatedTags(
            items.map((i) => i.journal),
            scope,
            taxonomy,
          ),
    [hits, items, scope, taxonomy],
  );
  const names = useMemo(
    () => ({
      category: new Map(taxonomy.categories.map((c) => [c.id, c.name])),
      tag: new Map(taxonomy.tags.map((t) => [t.id, t.name])),
    }),
    [taxonomy],
  );

  // Pfeiltasten-Navigation in der Trefferliste: nur ein Eintrag per Tab erreichbar
  const [active, setActive] = useState(0);
  const activeIndex = active < items.length ? active : 0;

  function onSearchKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' && items.length > 0) {
      e.preventDefault();
      setActive(0);
      listRef.current?.querySelector<HTMLElement>('[data-result]')?.focus();
    } else if (e.key === 'Escape' && query) {
      e.preventDefault();
      change({ query: '' });
    }
  }

  const selectScope = (s: FachbuchScope) => {
    change({ scope: s });
    setActive(0);
  };

  const heading = scopeLabel(scope, taxonomy);
  const summary = showMerkstellen
    ? countLabel(shownMerkstellen.length, 'Merkstelle', 'Merkstellen')
    : tooShort
      ? `Suchbegriffe ab ${MIN_WORD_LENGTH} Zeichen eingeben.`
      : pending
        ? 'Sucht …'
        : hits
          ? `${countLabel(items.length, 'Treffer', 'Treffer')} für «${trimmed}»`
          : countLabel(items.length, 'Journal', 'Journale');

  return (
    <ViewFrame title="Fachbuch">
      <div className="flex flex-wrap items-center gap-4">
        <div role="search" className="relative w-full max-w-xl">
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
            maxLength={200}
            onChange={(e) => change({ query: e.target.value })}
            onKeyDown={onSearchKey}
            placeholder="Im Fachbuch suchen, z. B. «Farbmessung»"
            aria-describedby="fachbuch-search-hint"
            className="w-full rounded-sm border border-border-strong bg-surface py-2 pl-10 pr-3 text-sm placeholder:text-ink-muted"
          />
          <span id="fachbuch-search-hint" className="sr-only">
            Sucht in Titeln, Texten, Bildlegenden, Schlagwörtern und Kategorien, auch nach Wortteilen ab 3
            Zeichen. Pfeil nach unten springt zu den Treffern.
          </span>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => change({ includeArchived: e.target.checked })}
            className="size-4 accent-accent"
          />
          Archivierte einbeziehen
        </label>
      </div>

      {state.journals.length === 0 ? (
        <EmptyState icon={BookOpen} title="Dein persönliches Fachbuch">
          Alle Journale, geordnet nach Themen und Schlagwörtern und durchsuchbar – ohne doppelte Inhalte.
          Während der IPA darfst du deine Lerndokumentation als Hilfsmittel verwenden.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-[14rem_minmax(0,1fr)] items-start gap-6">
          <nav aria-label="Themen und Schlagwörter" className="space-y-5">
            <div>
              <h2 id="fachbuch-topics" className="mb-1 px-2 text-sm font-semibold">
                Themen
              </h2>
              <ul aria-labelledby="fachbuch-topics">
                <li>
                  <TopicButton
                    scope={{ kind: 'all' }}
                    current={scope}
                    label="Alle Journale"
                    count={overview.total}
                    onSelect={selectScope}
                  />
                </li>
                {overview.categories.map((c) => (
                  <li key={c.id}>
                    <TopicButton
                      scope={{ kind: 'category', id: c.id }}
                      current={scope}
                      label={c.name}
                      count={c.count}
                      onSelect={selectScope}
                    />
                  </li>
                ))}
                {overview.uncategorized > 0 && (
                  <li>
                    <TopicButton
                      scope={{ kind: 'uncategorized' }}
                      current={scope}
                      label="Ohne Kategorie"
                      count={overview.uncategorized}
                      onSelect={selectScope}
                    />
                  </li>
                )}
              </ul>
            </div>
            <div>
              <h2 id="fachbuch-marks" className="mb-1 px-2 text-sm font-semibold">
                Nachschlagen
              </h2>
              <ul aria-labelledby="fachbuch-marks">
                <li>
                  <TopicButton
                    scope={{ kind: 'merkstellen' }}
                    current={scope}
                    label="Merkstellen"
                    count={merkCount}
                    onSelect={selectScope}
                  />
                </li>
              </ul>
            </div>
            {overview.tags.length > 0 && (
              <div>
                <h2 id="fachbuch-tags" className="mb-1 px-2 text-sm font-semibold">
                  Schlagwörter
                </h2>
                <ul aria-labelledby="fachbuch-tags">
                  {overview.tags.map((t) => (
                    <li key={t.id}>
                      <TopicButton
                        scope={{ kind: 'tag', id: t.id }}
                        current={scope}
                        label={t.name}
                        count={t.count}
                        onSelect={selectScope}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </nav>

          <section aria-labelledby="fachbuch-heading" className="min-w-0 space-y-3">
            <div>
              <h2 id="fachbuch-heading" className="text-lg font-semibold">
                {heading}
              </h2>
              {/* Anzahl wird Screenreadern angesagt, sobald die Suche fertig ist */}
              <p role="status" className="text-sm text-ink-muted" aria-busy={pending || undefined}>
                {failed ? 'Suche fehlgeschlagen. Bitte erneut versuchen.' : summary}
                {hits && result?.data.truncated && ' (nur die besten werden angezeigt)'}
              </p>
            </div>

            {showMerkstellen ? (
              <MerkstellenList items={shownMerkstellen} query={query} />
            ) : (
              <>
                {related.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-ink-muted">
                      {scope.kind === 'tag' ? 'Oft zusammen mit:' : 'Häufige Schlagwörter:'}
                    </span>
                    {related.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => selectScope({ kind: 'tag', id: t.id })}
                        className="rounded-full border border-border-strong bg-surface px-2.5 py-0.5 hover:bg-hover"
                      >
                        {t.name} <span className="text-ink-muted">({t.count})</span>
                      </button>
                    ))}
                  </div>
                )}

                {items.length > 0 ? (
                  <ul
                    ref={listRef}
                    aria-label={hits ? 'Treffer' : 'Journale'}
                    onKeyDown={(e) => handleRovingKeys(e, 'vertical', '[data-result]')}
                    className="divide-y divide-border-subtle rounded-md border border-border bg-surface"
                  >
                    {items.map((item, i) => (
                      <ResultEntry
                        key={item.journal.id}
                        item={item}
                        names={names}
                        tabbable={i === activeIndex}
                        onFocus={() => setActive(i)}
                      />
                    ))}
                  </ul>
                ) : hits ? (
                  !pending && (
                    <EmptyState icon={SearchX} title={`Keine Treffer für «${trimmed}»`}>
                      Auch Wortteile werden gefunden: «messung» findet «Farbmessung». Fehlt ein Journal,
                      obwohl der Begriff darin steht? In den Einstellungen lässt sich der Suchindex neu
                      aufbauen.
                    </EmptyState>
                  )
                ) : (
                  <p className="rounded-md border border-dashed border-border bg-surface px-4 py-8 text-center text-sm text-ink-muted">
                    {scope.kind === 'uncategorized'
                      ? 'Alle Journale sind einer Kategorie zugeordnet.'
                      : 'Noch keine Journale hier. Kategorien und Schlagwörter ordnest du im Journal zu (Register «Journal»).'}
                  </p>
                )}

                {hits && outsideScope > 0 && (
                  <p className="text-sm">
                    {countLabel(outsideScope, 'weiterer Treffer', 'weitere Treffer')} ausserhalb von «
                    {heading}».{' '}
                    <button
                      type="button"
                      onClick={() => selectScope({ kind: 'all' })}
                      className="text-accent underline hover:bg-hover"
                    >
                      In allen Journalen suchen
                    </button>
                  </p>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </ViewFrame>
  );
}
