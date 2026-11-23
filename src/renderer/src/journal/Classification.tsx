// Kategorien und Schlagwörter eines Journals (alles freiwillig).
// - Kategorien: aufklappbare Liste mit Kontrollkästchen (<details>, per Tastatur bedienbar)
// - Schlagwörter: Eingabefeld mit Vorschlägen; Enter oder Komma fügt hinzu, × entfernt
import { useState, type KeyboardEvent } from 'react';
import { FolderTree, Tags, X } from 'lucide-react';
import type { JournalSummary } from '@shared/journal';
import { useApp } from '../state/AppContext';
import { setJournalCategories, setJournalTags } from './actions';

export function Classification({ journal }: { journal: JournalSummary }) {
  const { state, dispatch } = useApp();
  const [tagInput, setTagInput] = useState('');
  const [tagError, setTagError] = useState<string | null>(null);

  const assignedCats = state.categories.filter((c) => journal.categoryIds.includes(c.id));
  const assignedTags = state.tags.filter((t) => journal.tagIds.includes(t.id));

  function toggleCategory(id: string, on: boolean) {
    const next = on ? [...journal.categoryIds, id] : journal.categoryIds.filter((c) => c !== id);
    // Sofort anzeigen (optimistisch); schlägt das Speichern fehl, alten Zustand wiederherstellen
    dispatch({ type: 'journalUpserted', journal: { ...journal, categoryIds: next } });
    void setJournalCategories(dispatch, journal.id, next).then((ok) => {
      if (!ok) dispatch({ type: 'journalUpserted', journal });
    });
  }

  async function saveTags(names: string[]) {
    setTagError(await setJournalTags(dispatch, journal.id, names));
  }

  function addTag() {
    const name = tagInput.replace(/,/g, ' ').trim();
    if (!name) return;
    setTagInput('');
    if (assignedTags.some((t) => t.name.toLowerCase() === name.toLowerCase())) return;
    void saveTags([...assignedTags.map((t) => t.name), name]);
  }

  function onTagKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag();
    } else if (e.key === 'Backspace' && !tagInput && assignedTags.length > 0) {
      // Leeres Feld + Rücktaste: letztes Schlagwort entfernen (wie in Mail-Programmen)
      void saveTags(assignedTags.slice(0, -1).map((t) => t.name));
    }
  }

  return (
    <div className="mt-4 grid gap-4 border-b border-border-subtle pb-4 text-sm md:grid-cols-2">
      <div>
        <details className="group">
          <summary
            id="journal-categories-summary"
            className="flex cursor-pointer list-none items-center gap-2 rounded-sm py-1 text-ink-muted hover:text-ink"
          >
            <FolderTree aria-hidden="true" size={16} />
            Kategorien {assignedCats.length > 0 && `(${assignedCats.length})`}
            <span className="text-xs group-open:hidden">– wählen</span>
          </summary>
          <fieldset className="mt-2 max-h-60 space-y-1 overflow-auto rounded-sm border border-border bg-surface p-2">
            <legend className="sr-only">Kategorien zuordnen</legend>
            {state.categories.length === 0 && (
              <p className="text-ink-muted">
                Noch keine Kategorien. Du kannst sie in den Einstellungen anlegen.
              </p>
            )}
            {state.categories.map((c) => (
              <label key={c.id} className="flex items-start gap-2 rounded-sm px-1 py-0.5 hover:bg-hover">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-accent"
                  checked={journal.categoryIds.includes(c.id)}
                  onChange={(e) => toggleCategory(c.id, e.target.checked)}
                />
                <span>{c.name}</span>
              </label>
            ))}
          </fieldset>
        </details>
        {assignedCats.length > 0 && (
          <ul className="mt-1 flex flex-wrap gap-1" aria-label="Zugeordnete Kategorien">
            {assignedCats.map((c) => (
              <li key={c.id} className="rounded-sm bg-selected px-2 py-0.5 text-xs">
                {c.name}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <label htmlFor="journal-tags-input" className="flex items-center gap-2 py-1 text-ink-muted">
          <Tags aria-hidden="true" size={16} /> Schlagwörter
        </label>
        <div className="flex flex-wrap items-center gap-1 rounded-sm border border-border-strong bg-surface px-2 py-1">
          {assignedTags.map((t) => (
            <span
              key={t.id}
              className="inline-flex items-center gap-1 rounded-full bg-selected py-0.5 pl-2 pr-1 text-xs"
            >
              {t.name}
              <button
                type="button"
                className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-hover"
                aria-label={`Schlagwort «${t.name}» entfernen`}
                onClick={() => void saveTags(assignedTags.filter((x) => x.id !== t.id).map((x) => x.name))}
              >
                <X aria-hidden="true" size={12} />
              </button>
            </span>
          ))}
          <input
            id="journal-tags-input"
            list="journal-tag-suggestions"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={onTagKey}
            onBlur={addTag}
            placeholder={assignedTags.length ? '' : 'z. B. Farbmessung, Bogenoffset'}
            aria-describedby="journal-tags-hint"
            className="min-w-32 flex-1 border-0 bg-transparent py-1 text-sm placeholder:text-ink-muted focus:outline-none"
          />
          <datalist id="journal-tag-suggestions">
            {state.tags
              .filter((t) => !journal.tagIds.includes(t.id))
              .map((t) => (
                <option key={t.id} value={t.name} />
              ))}
          </datalist>
        </div>
        <p id="journal-tags-hint" className="mt-1 text-xs text-ink-muted">
          Enter oder Komma fügt hinzu. Schlagwörter sind im Fachbuch durchsuchbar.
        </p>
        {tagError && (
          <p role="alert" className="mt-1 text-xs text-danger">
            {tagError}
          </p>
        )}
      </div>
    </div>
  );
}
