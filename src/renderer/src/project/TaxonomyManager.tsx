// Kategorien und Schlagwörter verwalten: anlegen, umbenennen, zusammenführen, löschen.
import { useState, type FormEvent } from 'react';
import { Merge, Pencil, Plus, Trash2 } from 'lucide-react';
import { useApp } from '../state/AppContext';
import { ConfirmDialog } from '../shell/ConfirmDialog';
import { loadJournals } from '../journal/actions';

type Kind = 'category' | 'tag';
type Entry = { id: string; name: string; count: number };
type Pending =
  | { mode: 'rename'; kind: Kind; entry: Entry; value: string }
  | { mode: 'merge'; kind: Kind; entry: Entry; targetId: string }
  | { mode: 'delete'; kind: Kind; entry: Entry }
  | null;

const LABEL = { category: 'Kategorie', tag: 'Schlagwort' } as const;
const smallBtn = 'flex h-8 w-8 items-center justify-center rounded-sm hover:bg-hover';

export function TaxonomyManager() {
  const { state, dispatch } = useApp();
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState<string | null>(null);
  const [newCategory, setNewCategory] = useState('');

  async function apply(call: () => ReturnType<typeof window.lernjournal.taxonomy.list>, done?: string) {
    const res = await call();
    if (!res.ok) return setError(res.error.message);
    setError(null);
    setPending(null);
    dispatch({ type: 'taxonomyLoaded', ...res.data });
    void loadJournals(dispatch); // Zuordnungen der Journale können sich geändert haben
    if (done) dispatch({ type: 'notice', text: done });
  }

  function addCategory(e: FormEvent) {
    e.preventDefault();
    if (!newCategory.trim()) return;
    const name = newCategory;
    setNewCategory('');
    void apply(() => window.lernjournal.taxonomy.create({ kind: 'category', name }), 'Kategorie angelegt.');
  }

  function list(kind: Kind, entries: Entry[]) {
    return (
      <ul className="divide-y divide-border-subtle rounded-md border border-border bg-surface">
        {entries.length === 0 && <li className="px-3 py-2 text-ink-muted">Keine Einträge.</li>}
        {entries.map((e) => (
          <li key={e.id} className="flex items-center gap-2 px-3 py-1.5">
            <span className="min-w-0 flex-1 truncate">{e.name}</span>
            <span className="shrink-0 text-xs text-ink-muted">
              {e.count} {e.count === 1 ? 'Journal' : 'Journale'}
            </span>
            <button
              type="button"
              className={smallBtn}
              aria-label={`${LABEL[kind]} «${e.name}» umbenennen`}
              title="Umbenennen"
              onClick={() => setPending({ mode: 'rename', kind, entry: e, value: e.name })}
            >
              <Pencil aria-hidden="true" size={15} />
            </button>
            <button
              type="button"
              className={smallBtn}
              aria-label={`${LABEL[kind]} «${e.name}» zusammenführen`}
              title="Zusammenführen mit …"
              disabled={entries.length < 2}
              onClick={() =>
                setPending({
                  mode: 'merge',
                  kind,
                  entry: e,
                  targetId: entries.find((x) => x.id !== e.id)!.id,
                })
              }
            >
              <Merge aria-hidden="true" size={15} />
            </button>
            <button
              type="button"
              className={smallBtn}
              aria-label={`${LABEL[kind]} «${e.name}» löschen`}
              title="Löschen"
              onClick={() => setPending({ mode: 'delete', kind, entry: e })}
            >
              <Trash2 aria-hidden="true" size={15} />
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="tax-cat" className="space-y-2">
          <h3 id="tax-cat" className="font-semibold">
            Kategorien
          </h3>
          {list('category', state.categories)}
          <form onSubmit={addCategory} className="flex gap-2">
            <label htmlFor="new-category" className="sr-only">
              Neue Kategorie
            </label>
            <input
              id="new-category"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="Neue Kategorie"
              maxLength={80}
              className="min-w-0 flex-1 rounded-sm border border-border-strong px-2 py-1.5 text-sm"
            />
            <button
              type="submit"
              className="flex items-center gap-1 rounded-sm border border-border-strong px-3 py-1.5 text-sm hover:bg-hover"
            >
              <Plus aria-hidden="true" size={15} /> Hinzufügen
            </button>
          </form>
        </section>
        <section aria-labelledby="tax-tag" className="space-y-2">
          <h3 id="tax-tag" className="font-semibold">
            Schlagwörter
          </h3>
          {list('tag', state.tags)}
          <p className="text-xs text-ink-muted">
            Schlagwörter entstehen im Journal. Nicht mehr verwendete verschwinden automatisch.
          </p>
        </section>
      </div>

      {pending?.mode === 'rename' && (
        <ConfirmDialog
          title={`${LABEL[pending.kind]} umbenennen`}
          confirmLabel="Umbenennen"
          onCancel={() => setPending(null)}
          onConfirm={() =>
            void apply(
              () =>
                window.lernjournal.taxonomy.rename({
                  kind: pending.kind,
                  id: pending.entry.id,
                  name: pending.value,
                }),
              'Umbenannt.',
            )
          }
        >
          <label className="block">
            <span className="mb-1 block">Neuer Name für «{pending.entry.name}»</span>
            <input
              value={pending.value}
              maxLength={80}
              onChange={(e) => setPending({ ...pending, value: e.target.value })}
              className="w-full rounded-sm border border-border-strong px-2 py-1.5"
            />
          </label>
          {error && <p className="mt-2 text-danger">{error}</p>}
        </ConfirmDialog>
      )}
      {pending?.mode === 'merge' && (
        <ConfirmDialog
          title={`${LABEL[pending.kind]} zusammenführen`}
          confirmLabel="Zusammenführen"
          onCancel={() => setPending(null)}
          onConfirm={() =>
            void apply(
              () =>
                window.lernjournal.taxonomy.merge({
                  kind: pending.kind,
                  sourceId: pending.entry.id,
                  targetId: pending.targetId,
                }),
              'Zusammengeführt.',
            )
          }
        >
          <label className="block">
            <span className="mb-1 block">Alle Journale mit «{pending.entry.name}» bekommen stattdessen:</span>
            <select
              value={pending.targetId}
              onChange={(e) => setPending({ ...pending, targetId: e.target.value })}
              className="w-full rounded-sm border border-border-strong px-2 py-1.5"
            >
              {(pending.kind === 'category' ? state.categories : state.tags)
                .filter((x) => x.id !== pending.entry.id)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
            </select>
          </label>
          <p className="mt-2 text-ink-muted">«{pending.entry.name}» wird danach entfernt.</p>
        </ConfirmDialog>
      )}
      {pending?.mode === 'delete' && (
        <ConfirmDialog
          title={`${LABEL[pending.kind]} löschen?`}
          confirmLabel="Löschen"
          danger
          onCancel={() => setPending(null)}
          onConfirm={() =>
            void apply(
              () => window.lernjournal.taxonomy.delete({ kind: pending.kind, id: pending.entry.id }),
              'Gelöscht.',
            )
          }
        >
          <p>
            «{pending.entry.name}» wird entfernt. Die {pending.entry.count} zugeordneten Journale bleiben
            erhalten.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
