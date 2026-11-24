// Startbildschirm ohne geöffnetes Projekt (wie die Office-Startseite):
// neues Lernjournal anlegen, vorhandenes öffnen, zuletzt verwendete.
import { NotebookPen } from 'lucide-react';
import appIcon from '../../../../assets/app-icon.svg';
import fileIcon from '../../../../assets/file-icon.svg';
import newIcon from '../../../../assets/new-icon.svg';
import oldIcon from '../../../../assets/old-icon.svg';
import { useApp } from '../state/AppContext';
import { formatDateTime } from './messages';
import { ConfirmForce, ErrorMessage, UnofficialHint } from './Notices';
import { useProjectActions } from './useProjectActions';

function WelcomeAction({
  icon,
  title,
  description,
  onClick,
  disabled,
}: {
  icon: string;
  title: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4 text-left shadow-sm hover:border-accent hover:bg-paper/40 disabled:opacity-60 sm:flex-col lg:gap-4 lg:p-5"
    >
      <img src={icon} alt="" width="64" height="64" className="size-14 shrink-0 object-contain lg:size-16" />
      <span>
        <span className="block font-semibold text-accent-strong">{title}</span>
        <span className="mt-1 block text-sm text-ink-muted">{description}</span>
      </span>
    </button>
  );
}

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
      <div className="mx-auto max-w-4xl space-y-5 px-5 py-6 sm:px-8 lg:space-y-6 lg:py-10">
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-paper p-5 lg:gap-5 lg:p-6">
          <img src={appIcon} alt="" width="80" height="80" className="size-16 shrink-0 lg:size-20" />
          <div className="min-w-0 flex-1 basis-64">
            <h1 id="welcome-title" className="text-2xl font-semibold text-accent-strong lg:text-3xl">
              Lernjournal
            </h1>
            <p className="mt-2 text-ink-muted">
              Halte deine Arbeiten aus Lehrbetrieb, üK und Schule als Lernberichte fest – daraus entsteht dein
              persönliches Fachbuch.
            </p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <WelcomeAction
            icon={newIcon}
            title="Neues Lernjournal anlegen"
            description="Projektordner, Profil und Kategorien einrichten."
            onClick={() => dispatch({ type: 'openWizard' })}
          />
          <WelcomeAction
            icon={oldIcon}
            title="Vorhandenes öffnen"
            description="Einen Lernjournal-Ordner auswählen."
            onClick={() => void actions.chooseAndOpen()}
            disabled={actions.busy}
          />
          <WelcomeAction
            icon={fileIcon}
            title="Projekt importieren"
            description="Ein Lernjournal aus einer .ajournal-Datei übernehmen."
            onClick={() => dispatch({ type: 'openArchive', mode: 'import' })}
          />
        </div>

        {actions.error && <ErrorMessage>{actions.error}</ErrorMessage>}
        {actions.confirmForce && (
          <ConfirmForce
            message={actions.confirmForce.message}
            onConfirm={() => void actions.open(actions.confirmForce!.path, true)}
            onCancel={() => actions.setConfirmForce(null)}
          />
        )}

        <UnofficialHint />

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
