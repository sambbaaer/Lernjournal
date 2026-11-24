// Kategorien und Schlagwörter im geöffneten Journal (AJ-09).
//
// Beide sind freiwillig und werden sofort gespeichert (es gibt nichts zu
// «tippen und warten» wie im Text). Bedienung:
//  - Kategorien: Knopf «Auswählen …» öffnet eine Liste mit Kontrollkästchen.
//    Esc oder «Fertig» schliesst sie, der Fokus kehrt zum Knopf zurück.
//  - Schlagwörter: Eingabefeld; Enter oder Komma fügt hinzu, Rücktaste im
//    leeren Feld entfernt das letzte. Vorschläge aus bestehenden Schlagwörtern.
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ChevronDown, Plus, X } from 'lucide-react';
import type { JournalSummary } from '@shared/journal';
import { CATEGORY_NAME_MAX, TAG_NAME_MAX, nameKey, normalizeName, normalizeTagName } from '@shared/taxonomy';
import { useApp } from '../state/AppContext';
import { setJournalCategories, setJournalTags, taxonomyErrorText } from './actions';

const chip =
  'inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-canvas px-2.5 py-0.5 text-sm';

export function TaxonomyFields({ journal }: { journal: JournalSummary }) {
  return (
    <div className="mt-4 grid grid-cols-[auto_1fr] items-start gap-x-4 gap-y-3 text-sm">
      <CategoryField journal={journal} />
      <TagField journal={journal} />
    </div>
  );
}

function CategoryField({ journal }: { journal: JournalSummary }) {
  const { state, dispatch } = useApp();
  const { categories } = state.taxonomy;
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const labelId = useId();
  // Auswahl sofort anzeigen (optimistisch), bis der Hauptprozess bestätigt hat;
  // schlägt das Speichern fehl, gilt wieder der gespeicherte Stand.
  const [optimistic, setOptimistic] = useState<string[] | null>(null);
  const selected = new Set(optimistic ?? journal.categoryIds);
  const selectedCategories = categories.filter((c) => selected.has(c.id));

  function close(returnFocus = true) {
    setOpen(false);
    setError(null);
    if (returnFocus) toggleRef.current?.focus();
  }

  // Menüband «Journal → Kategorien»: Liste öffnen, Fokus aufs erste Kästchen.
  // Öffnen direkt beim Rendern (React-Muster «Zustand bei geänderten Daten
  // anpassen»), die Anfrage danach im Effekt quittieren.
  const requested = state.focusRequest === 'journal-categories';
  const [seenRequest, setSeenRequest] = useState(false);
  if (requested !== seenRequest) {
    setSeenRequest(requested);
    if (requested) setOpen(true);
  }
  useEffect(() => {
    if (requested) dispatch({ type: 'requestFocus', target: null });
  }, [requested, dispatch]);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>('input')?.focus();
    panelRef.current?.scrollIntoView?.({ block: 'nearest' });
    // Klick ausserhalb schliesst die Liste (wie ein Office-Dropdown)
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !toggleRef.current?.contains(t)) {
        setOpen(false);
        setError(null);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  async function save(next: string[]) {
    setOptimistic(next);
    await setJournalCategories(dispatch, journal.id, next);
    // Erfolg: Zustand enthält jetzt die gespeicherte Auswahl. Fehler: zurück.
    // Nur zurücksetzen, wenn inzwischen kein neuerer Klick kam.
    setOptimistic((cur) => (cur === next ? null : cur));
  }

  function toggle(id: string, on: boolean) {
    void save(categories.filter((c) => (c.id === id ? on : selected.has(c.id))).map((c) => c.id));
  }

  // Neue Kategorie anlegen und gleich diesem Journal zuordnen
  async function create(e: FormEvent) {
    e.preventDefault();
    const name = normalizeName(newName);
    if (!name) return;
    const existing = categories.find((c) => nameKey(c.name) === nameKey(name));
    if (existing) {
      // Gibt es schon: einfach ankreuzen statt Fehlermeldung
      if (!selected.has(existing.id)) toggle(existing.id, true);
      setNewName('');
      return;
    }
    const res = await window.lernjournal.taxonomy.createCategory({ name }).catch(() => null);
    if (!res?.ok) return setError(taxonomyErrorText(res));
    dispatch({ type: 'taxonomyLoaded', taxonomy: res.data });
    setError(null);
    setNewName('');
    const created = res.data.categories.find((c) => nameKey(c.name) === nameKey(name));
    if (created) void save([...selected, created.id]);
  }

  function onPanelKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  }

  return (
    <>
      <span id={labelId} className="pt-1 text-ink-muted">
        Kategorien
      </span>
      <div className="relative">
        <div className="flex flex-wrap items-center gap-1.5">
          {selectedCategories.length === 0 && <span className="italic text-ink-muted">keine</span>}
          {selectedCategories.map((c) => (
            <span key={c.id} className={chip}>
              <span className="truncate">{c.name}</span>
            </span>
          ))}
          <button
            ref={toggleRef}
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            aria-describedby={labelId}
            onClick={() => (open ? close() : setOpen(true))}
            className="inline-flex items-center gap-1 rounded-sm px-2 py-1 text-accent hover:bg-hover"
          >
            Auswählen <ChevronDown aria-hidden="true" size={14} />
          </button>
        </div>
        {open && (
          <div
            ref={panelRef}
            id={panelId}
            onKeyDown={onPanelKey}
            className="absolute left-0 top-full z-20 mt-1 w-[34rem] max-w-[calc(100vw-4rem)] rounded-md border border-border bg-surface p-3 shadow-lg"
          >
            <fieldset>
              <legend className="mb-2 font-semibold">Kategorien für dieses Journal</legend>
              {categories.length === 0 ? (
                <p className="text-ink-muted">Noch keine Kategorien. Lege unten die erste an.</p>
              ) : (
                <ul className="max-h-64 space-y-0.5 overflow-y-auto">
                  {categories.map((c) => (
                    <li key={c.id}>
                      <label className="flex cursor-pointer items-start gap-2 rounded-sm px-1 py-1 hover:bg-hover">
                        <input
                          type="checkbox"
                          checked={selected.has(c.id)}
                          onChange={(e) => toggle(c.id, e.target.checked)}
                          className="mt-0.5 size-4 shrink-0 accent-accent"
                        />
                        <span>{c.name}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </fieldset>
            <form
              onSubmit={(e) => void create(e)}
              className="mt-3 flex gap-2 border-t border-border-subtle pt-3"
            >
              <label className="sr-only" htmlFor={`${panelId}-new`}>
                Neue Kategorie
              </label>
              <input
                id={`${panelId}-new`}
                value={newName}
                maxLength={CATEGORY_NAME_MAX}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Neue Kategorie"
                className="min-w-0 flex-1 rounded-sm border border-border-strong px-2 py-1"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1 rounded-sm px-2 py-1 hover:bg-hover"
              >
                <Plus aria-hidden="true" size={14} /> Hinzufügen
              </button>
              <button
                type="button"
                onClick={() => close()}
                className="rounded-sm bg-action px-3 py-1 font-semibold text-white hover:bg-action-hover"
              >
                Fertig
              </button>
            </form>
            {error && (
              <p role="alert" className="mt-2 text-danger">
                {error}
              </p>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function TagField({ journal }: { journal: JournalSummary }) {
  const { state, dispatch } = useApp();
  const { tags } = state.taxonomy;
  const [text, setText] = useState('');
  const [hint, setHint] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const hintId = useId();
  const byId = useMemo(() => new Map(tags.map((t) => [t.id, t.name])), [tags]);
  const current = journal.tagIds.map((id) => byId.get(id)).filter((n): n is string => !!n);
  const currentKeys = new Set(current.map(nameKey));
  // Vorschläge: bestehende Schlagwörter, die dieses Journal noch nicht hat
  const suggestions = tags.filter((t) => !currentKeys.has(nameKey(t.name)));

  // Menüband «Journal → Schlagwörter»
  useEffect(() => {
    if (state.focusRequest !== 'journal-tags') return;
    dispatch({ type: 'requestFocus', target: null });
    inputRef.current?.focus();
    inputRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [state.focusRequest, dispatch]);

  // Eingabe (auch mehrere, durch Komma getrennt) übernehmen
  function commit(raw: string): void {
    const names = raw.split(',').map(normalizeTagName).filter(Boolean);
    if (names.length === 0) return setText('');
    const tooLong = names.find((n) => n.length > TAG_NAME_MAX);
    if (tooLong) return setHint(`Schlagwörter dürfen höchstens ${TAG_NAME_MAX} Zeichen lang sein.`);
    // Schreibweise eines bestehenden Schlagworts übernehmen («farbmessung» → «Farbmessung»)
    const known = new Map(tags.map((t) => [nameKey(t.name), t.name]));
    const next = [...current];
    for (const n of names) {
      if (next.some((x) => nameKey(x) === nameKey(n))) continue;
      next.push(known.get(nameKey(n)) ?? n);
    }
    setText('');
    setHint(null);
    if (next.length !== current.length) void setJournalTags(dispatch, journal.id, next);
  }

  function remove(name: string) {
    void setJournalTags(
      dispatch,
      journal.id,
      current.filter((n) => n !== name),
    );
    inputRef.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit(text);
    } else if (e.key === 'Backspace' && text === '' && current.length > 0) {
      e.preventDefault();
      remove(current[current.length - 1]!);
    }
  }

  return (
    <>
      <label htmlFor={`${listId}-input`} className="pt-1 text-ink-muted">
        Schlagwörter
      </label>
      <div>
        <div className="flex flex-wrap items-center gap-1.5">
          <ul aria-label="Schlagwörter dieses Journals" className="contents">
            {current.map((n) => (
              <li key={n} className={chip}>
                <span className="truncate">{n}</span>
                <button
                  type="button"
                  aria-label={`Schlagwort «${n}» entfernen`}
                  title="Entfernen"
                  onClick={() => remove(n)}
                  className="-mr-1 grid size-5 place-items-center rounded-full text-ink-muted hover:bg-hover hover:text-ink"
                >
                  <X aria-hidden="true" size={12} />
                </button>
              </li>
            ))}
          </ul>
          <input
            ref={inputRef}
            id={`${listId}-input`}
            list={listId}
            value={text}
            maxLength={TAG_NAME_MAX * 3}
            aria-describedby={hintId}
            onChange={(e) => {
              // Auswahl aus der Vorschlagsliste oder eingefügter Text mit Komma
              const v = e.target.value;
              if (v.includes(',')) commit(v);
              else setText(v);
            }}
            onKeyDown={onKeyDown}
            // Nichts verlieren: Verlässt man das Feld, wird die Eingabe übernommen
            onBlur={() => text.trim() && commit(text)}
            placeholder={current.length ? 'Weiteres Schlagwort' : 'z. B. Farbmessung'}
            className="min-w-40 flex-1 rounded-sm border border-border-strong bg-surface px-2 py-1"
          />
          <datalist id={listId}>
            {suggestions.map((t) => (
              <option key={t.id} value={t.name} />
            ))}
          </datalist>
        </div>
        <p id={hintId} className={`mt-1 text-xs ${hint ? 'text-danger' : 'text-ink-muted'}`}>
          {hint ?? 'Enter oder Komma fügt hinzu. Freiwillig – hilft später beim Finden im Fachbuch.'}
        </p>
      </div>
    </>
  );
}
