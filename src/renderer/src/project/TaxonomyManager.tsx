// Einstellungen → «Kategorien und Schlagwörter» (AJ-09): umbenennen,
// zusammenführen, löschen; Kategorien zusätzlich anlegen und die Vorschläge
// a–g ergänzen. Journale werden dabei nie gelöscht oder kopiert – es ändern
// sich nur die Zuordnungen.
import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { Combine, Pencil, Plus, Trash2 } from 'lucide-react';
import { CATEGORY_NAME_MAX, TAG_NAME_MAX, type TaxonomyKind } from '@shared/taxonomy';
import { useApp } from '../state/AppContext';
import { ConfirmDialog } from '../shell/ConfirmDialog';
import { changeTaxonomy, TAXONOMY_LABELS } from '../journal/actions';
import { ErrorMessage } from './Notices';

type Term = { id: string; name: string; journalCount: number };

// Laufende Bearbeitung einer Zeile
type Edit = { id: string; mode: 'rename'; name: string } | { id: string; mode: 'merge'; targetId: string };
// Rückfrage vor endgültigen Änderungen
type Pending = { action: 'delete'; term: Term } | { action: 'merge'; term: Term; target: Term };

const rowButton = 'inline-flex items-center gap-1 rounded-sm px-2 py-1 text-sm hover:bg-hover';
const input = 'rounded-sm border border-border-strong bg-surface px-2 py-1 text-sm';

// «1 Journal», «0 Journale» (Spalte) bzw. «bei 2 Journalen» (Satz im Dialog)
const journals = (n: number) => (n === 1 ? '1 Journal' : `${n} Journale`);
const beiJournalen = (n: number) => (n === 1 ? 'bei 1 Journal' : `bei ${n} Journalen`);

export function TaxonomyManager() {
  const { state, dispatch } = useApp();
  const { categories, tags, missingSuggestions } = state.taxonomy;
  const [newCategory, setNewCategory] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function addCategory(e: FormEvent) {
    e.preventDefault();
    if (!newCategory.trim()) return;
    const err = await changeTaxonomy(dispatch, () =>
      window.lernjournal.taxonomy.createCategory({ name: newCategory }),
    );
    setError(err);
    if (!err) {
      setNewCategory('');
      dispatch({ type: 'notice', text: 'Kategorie angelegt.' });
    }
  }

  async function addSuggestions() {
    const err = await changeTaxonomy(dispatch, () => window.lernjournal.taxonomy.addSuggestions());
    setError(err);
    if (!err) dispatch({ type: 'notice', text: 'Vorschlag-Kategorien a–g ergänzt.' });
  }

  return (
    <section aria-labelledby="settings-taxonomy" className="max-w-3xl space-y-6">
      <div>
        <h2 id="settings-taxonomy" className="text-lg font-semibold">
          Kategorien und Schlagwörter
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Zuordnen kannst du sie direkt im Journal. Hier räumst du auf. Journale bleiben dabei immer erhalten.
        </p>
      </div>

      <div className="space-y-3">
        <h3 className="font-semibold">Kategorien</h3>
        <TermTable kind="category" terms={categories} onError={setError} />
        <form onSubmit={(e) => void addCategory(e)} className="flex flex-wrap items-center gap-2">
          <label htmlFor="new-category" className="sr-only">
            Neue Kategorie
          </label>
          <input
            id="new-category"
            value={newCategory}
            maxLength={CATEGORY_NAME_MAX}
            onChange={(e) => setNewCategory(e.target.value)}
            placeholder="Neue Kategorie"
            className={`${input} w-72`}
          />
          <button type="submit" className={`${rowButton} border border-border-strong bg-surface`}>
            <Plus aria-hidden="true" size={16} /> Kategorie hinzufügen
          </button>
          {missingSuggestions > 0 && (
            <button type="button" onClick={() => void addSuggestions()} className={rowButton}>
              Vorschläge a–g aus dem Bildungsplan ergänzen ({missingSuggestions} fehlen)
            </button>
          )}
        </form>
      </div>

      <div className="space-y-3">
        <h3 className="font-semibold">Schlagwörter</h3>
        {tags.length === 0 ? (
          <p className="text-sm text-ink-muted">
            Noch keine Schlagwörter. Sie entstehen, wenn du im Journal welche einträgst, und verschwinden
            wieder, wenn kein Journal sie mehr verwendet.
          </p>
        ) : (
          <TermTable kind="tag" terms={tags} onError={setError} />
        )}
      </div>

      {error && <ErrorMessage>{error}</ErrorMessage>}
    </section>
  );
}

function TermTable({
  kind,
  terms,
  onError,
}: {
  kind: TaxonomyKind;
  terms: Term[];
  onError: (e: string | null) => void;
}) {
  const { dispatch } = useApp();
  const [edit, setEdit] = useState<Edit | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const label = TAXONOMY_LABELS[kind];
  const others = (id: string) => terms.filter((t) => t.id !== id);

  async function rename(id: string, name: string) {
    const err = await changeTaxonomy(dispatch, () => window.lernjournal.taxonomy.rename({ kind, id, name }));
    onError(err);
    if (!err) {
      setEdit(null);
      dispatch({ type: 'notice', text: `${label.one} umbenannt.` });
    }
  }

  async function confirm(p: Pending) {
    setPending(null);
    setEdit(null);
    const err = await changeTaxonomy(
      dispatch,
      () =>
        p.action === 'delete'
          ? window.lernjournal.taxonomy.delete({ kind, id: p.term.id })
          : window.lernjournal.taxonomy.merge({ kind, sourceId: p.term.id, targetId: p.target.id }),
      { reloadJournals: true },
    );
    onError(err);
    if (!err) {
      dispatch({
        type: 'notice',
        text: p.action === 'delete' ? `${label.one} gelöscht.` : `${label.many} zusammengeführt.`,
      });
    }
  }

  function onEditKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      setEdit(null);
    }
  }

  return (
    <>
      <table className="w-full border-collapse overflow-hidden rounded-md border border-border bg-surface text-sm">
        <caption className="sr-only">{label.many}</caption>
        <thead className="bg-ribbon text-left text-ink-muted">
          <tr>
            <th scope="col" className="px-3 py-2 font-semibold">
              Name
            </th>
            <th scope="col" className="w-28 px-3 py-2 font-semibold">
              Verwendet
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              <span className="sr-only">Aktionen</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {terms.map((t) => {
            const e = edit?.id === t.id ? edit : null;
            return (
              <tr key={t.id} className="border-t border-border-subtle align-top">
                <td className="px-3 py-1.5">
                  {e?.mode === 'rename' ? (
                    <form
                      onSubmit={(ev) => {
                        ev.preventDefault();
                        void rename(t.id, e.name);
                      }}
                      onKeyDown={onEditKey}
                      className="flex gap-2"
                    >
                      <label htmlFor={`rename-${t.id}`} className="sr-only">
                        Neuer Name für «{t.name}»
                      </label>
                      <input
                        id={`rename-${t.id}`}
                        autoFocus
                        value={e.name}
                        maxLength={kind === 'category' ? CATEGORY_NAME_MAX : TAG_NAME_MAX}
                        onChange={(ev) => setEdit({ ...e, name: ev.target.value })}
                        className={`${input} min-w-0 flex-1`}
                      />
                      <button type="submit" className={`${rowButton} font-semibold`}>
                        Speichern
                      </button>
                      <button type="button" className={rowButton} onClick={() => setEdit(null)}>
                        Abbrechen
                      </button>
                    </form>
                  ) : (
                    <span className="block py-1">{t.name}</span>
                  )}
                  {e?.mode === 'merge' && (
                    <form
                      onSubmit={(ev) => {
                        ev.preventDefault();
                        const target = terms.find((x) => x.id === e.targetId);
                        if (target) setPending({ action: 'merge', term: t, target });
                      }}
                      onKeyDown={onEditKey}
                      className="mt-1 flex flex-wrap items-center gap-2"
                    >
                      <label htmlFor={`merge-${t.id}`}>Zusammenführen mit</label>
                      <select
                        id={`merge-${t.id}`}
                        autoFocus
                        value={e.targetId}
                        onChange={(ev) => setEdit({ ...e, targetId: ev.target.value })}
                        className={`${input} max-w-72`}
                      >
                        {others(t.id).map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                      </select>
                      <button type="submit" className={`${rowButton} font-semibold`}>
                        Weiter …
                      </button>
                      <button type="button" className={rowButton} onClick={() => setEdit(null)}>
                        Abbrechen
                      </button>
                    </form>
                  )}
                </td>
                <td className="px-3 py-2 tabular-nums text-ink-muted">{journals(t.journalCount)}</td>
                <td className="px-3 py-1.5">
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      className={rowButton}
                      aria-label={`«${t.name}» umbenennen`}
                      onClick={() => setEdit({ id: t.id, mode: 'rename', name: t.name })}
                    >
                      <Pencil aria-hidden="true" size={14} /> Umbenennen
                    </button>
                    <button
                      type="button"
                      className={rowButton}
                      aria-label={`«${t.name}» mit … zusammenführen`}
                      aria-disabled={others(t.id).length === 0 ? true : undefined}
                      title={others(t.id).length === 0 ? `Nur ein Eintrag vorhanden` : undefined}
                      onClick={() => {
                        const first = others(t.id)[0];
                        if (first) setEdit({ id: t.id, mode: 'merge', targetId: first.id });
                      }}
                    >
                      <Combine aria-hidden="true" size={14} /> Zusammenführen
                    </button>
                    <button
                      type="button"
                      className={rowButton}
                      aria-label={`«${t.name}» löschen`}
                      onClick={() => setPending({ action: 'delete', term: t })}
                    >
                      <Trash2 aria-hidden="true" size={14} /> Löschen
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {pending?.action === 'delete' && (
        <ConfirmDialog
          title={`${label.one} «${pending.term.name}» löschen?`}
          confirmLabel="Löschen"
          danger
          onCancel={() => setPending(null)}
          onConfirm={() => void confirm(pending)}
        >
          <p>
            {pending.term.journalCount > 0
              ? `Die Zuordnung wird ${beiJournalen(pending.term.journalCount)} entfernt.`
              : 'Kein Journal verwendet sie.'}{' '}
            Die Journale selbst bleiben erhalten.
          </p>
        </ConfirmDialog>
      )}
      {pending?.action === 'merge' && (
        <ConfirmDialog
          title={`«${pending.term.name}» mit «${pending.target.name}» zusammenführen?`}
          confirmLabel="Zusammenführen"
          onCancel={() => setPending(null)}
          onConfirm={() => void confirm(pending)}
        >
          <p>
            Alle Journale mit «{pending.term.name}» erhalten «{pending.target.name}». Danach wird «
            {pending.term.name}» entfernt.
          </p>
        </ConfirmDialog>
      )}
    </>
  );
}
