// Startbildschirm ohne geöffnetes Projekt (wie die Office-Startseite):
// neues Lernjournal anlegen, vorhandenes öffnen, zuletzt verwendete.
import { FilePlus, FolderOpen, NotebookPen } from 'lucide-react';
import { useApp } from '../state/AppContext';
import { formatDateTime } from './messages';
import { ConfirmForce, ErrorMessage, UnofficialHint } from './Notices';
import { useProjectActions } from './useProjectActions';

export function Welcome() {
  const { state, dispatch } = useApp();
  const actions = useProjectActions();

  return (
    <main
      id="document"
      data-region="document"
      tabIndex={-1}
      className="min-h-0 flex-1 relative overflow-auto bg-canvas"
      aria-labelledby="welcome-title"
    >
      <div className="mx-auto max-w-3xl space-y-8 px-8 py-12">
        <div>
          <h1 id="welcome-title" className="text-3xl font-semibold">
            Lernjournal
          </h1>
          <p className="mt-2 text-ink-muted">
            Halte deine Arbeiten aus Lehrbetrieb, üK und Schule als Lernberichte fest – daraus entsteht dein
            persönliches Fachbuch.
          </p>
        </div>
        <UnofficialHint />

        <div className="grid gap-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => dispatch({ type: 'openWizard' })}
            className="flex items-start gap-4 rounded-md border border-border bg-surface p-5 text-left hover:border-accent hover:bg-selected"
          >
            <FilePlus aria-hidden="true" size={28} className="shrink-0 text-accent" />
            <span>
              <span className="block font-semibold">Neues Lernjournal anlegen</span>
              <span className="mt-1 block text-sm text-ink-muted">In drei kurzen Schritten startklar.</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => void actions.chooseAndOpen()}
            disabled={actions.busy}
            className="flex items-start gap-4 rounded-md border border-border bg-surface p-5 text-left hover:border-accent hover:bg-selected"
          >
            <FolderOpen aria-hidden="true" size={28} className="shrink-0 text-accent" />
            <span>
              <span className="block font-semibold">Vorhandenes öffnen …</span>
              <span className="mt-1 block text-sm text-ink-muted">Einen Lernjournal-Ordner auswählen.</span>
            </span>
          </button>
        </div>

        {actions.error && <ErrorMessage>{actions.error}</ErrorMessage>}
        {actions.confirmForce && (
          <ConfirmForce
            message={actions.confirmForce.message}
            onConfirm={() => void actions.open(actions.confirmForce!.path, true)}
            onCancel={() => actions.setConfirmForce(null)}
          />
        )}

        {state.recent.length > 0 && (
          <section aria-labelledby="recent-title">
            <h2 id="recent-title" className="mb-2 text-base font-semibold">
              Zuletzt verwendet
            </h2>
            <ul className="divide-y divide-border-subtle rounded-md border border-border bg-surface">
              {state.recent.map((r) => (
                <li key={r.path}>
                  <button
                    type="button"
                    onClick={() => void actions.open(r.path)}
                    disabled={actions.busy}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-hover"
                  >
                    <NotebookPen aria-hidden="true" size={18} className="shrink-0 text-ink-muted" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{r.title}</span>
                      <span className="block truncate text-xs text-ink-muted">{r.path}</span>
                    </span>
                    <span className="shrink-0 text-xs text-ink-muted">{formatDateTime(r.lastOpened)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
