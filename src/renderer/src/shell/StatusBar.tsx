// Statusleiste unten: Hinweise, Speicherstatus, direkter Zugang zu Sicherungen und Word-typischer Dokument-Zoom.
import { CircleAlert, LoaderCircle, Check, History, Minus, Plus } from 'lucide-react';
import { saveNow } from '../editor/save-registry';
import { useApp } from '../state/AppContext';
import { ZOOM_STEPS, type SaveStatus } from '../state/app-state';

const backupButton =
  'flex min-h-6 items-center gap-1 whitespace-nowrap rounded-sm px-2 font-semibold hover:bg-selected';

function SaveIndicator({ status, onBackups }: { status: SaveStatus; onBackups: () => void }) {
  switch (status.kind) {
    case 'idle':
      return (
        <button type="button" onClick={onBackups} className={backupButton}>
          <History aria-hidden="true" size={14} /> Sicherungen
        </button>
      );
    case 'pending':
      return <span>Änderungen ausstehend</span>;
    case 'saving':
      return (
        <span className="flex items-center gap-1">
          <LoaderCircle aria-hidden="true" size={14} className="animate-spin" />
          Speichert …
        </span>
      );
    case 'saved':
      return (
        <button
          type="button"
          onClick={onBackups}
          className={`${backupButton} text-success`}
          data-saved-at={status.at}
          title={`Sicherungen anzeigen · Zuletzt gespeichert am ${new Date(status.at).toLocaleString('de-CH')}`}
          aria-description="Zeigt die verfügbaren Sicherungen zur Wiederherstellung."
        >
          <Check aria-hidden="true" size={14} />
          Gespeichert
        </button>
      );
    case 'error':
      return (
        <span className="flex items-center gap-1 font-semibold text-danger">
          <CircleAlert aria-hidden="true" size={14} />
          Speichern fehlgeschlagen. {status.message}
          <button
            type="button"
            onClick={() => void saveNow()}
            className="ml-1 shrink-0 rounded-sm border border-danger px-2 py-0.5 font-semibold hover:bg-danger-bg"
          >
            Erneut versuchen
          </button>
        </span>
      );
  }
}

export function StatusBar({ version }: { version: string | null }) {
  const { state, dispatch } = useApp();
  const { saveStatus, journalDetailSave, openJournal, project, creatingJournal, zoomPercent } = state;
  let status = saveStatus;
  if (saveStatus.kind !== 'error' && journalDetailSave.active > 0) status = { kind: 'saving' };
  if (status.kind === 'saved' && openJournal)
    status = { ...status, at: Math.max(status.at, Date.parse(openJournal.updatedAt)) };
  const detailError = status.kind !== 'error' && !journalDetailSave.active && journalDetailSave.error;

  const zoomIdx = ZOOM_STEPS.indexOf(zoomPercent as (typeof ZOOM_STEPS)[number]);
  const prevZoom = zoomIdx > 0 ? ZOOM_STEPS[zoomIdx - 1] : null;
  const nextZoom = zoomIdx >= 0 && zoomIdx < ZOOM_STEPS.length - 1 ? ZOOM_STEPS[zoomIdx + 1] : null;

  return (
    <footer
      data-region="statusbar"
      aria-label="Statusleiste"
      tabIndex={-1}
      className="flex min-h-7 shrink-0 items-center gap-3 border-t border-border bg-surface px-3 text-xs text-ink-muted"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3" data-testid="statusbar-live">
        <span className="min-w-0 flex-1 truncate" aria-live="polite">
          {state.notice}
        </span>
        {project && (
          <button
            type="button"
            onClick={() => void window.lernjournal.project.showFolder()}
            className="max-w-64 truncate rounded-sm px-1.5 py-0.5 hover:bg-selected"
            title={`${project.path} · Im Explorer öffnen`}
          >
            {project.title}
          </button>
        )}
        {project && state.mcp.proposals.length > 0 && (
          <button type="button" className={backupButton} onClick={() => dispatch({ type: 'showMcp' })}>
            MCP-Vorschläge ({state.mcp.proposals.length})
          </button>
        )}
        <div aria-live="polite">
          {project &&
            !creatingJournal &&
            !state.wizardOpen &&
            (detailError ? (
              <span className="flex items-center gap-1 font-semibold text-danger">
                <CircleAlert aria-hidden="true" size={14} /> {detailError}
              </span>
            ) : (
              <SaveIndicator status={status} onBackups={() => dispatch({ type: 'showBackups' })} />
            ))}
        </div>
      </div>
      {project && !state.wizardOpen && !state.backstage && (
        <div
          className="flex shrink-0 items-center gap-0.5 border-l border-border-subtle pl-2"
          role="group"
          aria-label="Dokument-Zoom"
        >
          <button
            type="button"
            disabled={!prevZoom}
            aria-label="Verkleinern"
            title="Ansicht verkleinern (Strg+-)"
            onClick={() => prevZoom && dispatch({ type: 'setZoomPercent', zoomPercent: prevZoom })}
            className="flex h-6 w-6 items-center justify-center rounded-sm hover:bg-selected disabled:opacity-40"
          >
            <Minus aria-hidden="true" size={12} />
          </button>
          <button
            type="button"
            aria-label={`Zoom ${zoomPercent} % (auf 100 % zurücksetzen)`}
            title="Auf 100 % zurücksetzen (Strg+0)"
            onClick={() => dispatch({ type: 'setZoomPercent', zoomPercent: 100 })}
            className="min-w-11 rounded-sm px-1 py-0.5 text-center tabular-nums hover:bg-selected"
          >
            {zoomPercent} %
          </button>
          <button
            type="button"
            disabled={!nextZoom}
            aria-label="Vergrössern"
            title="Ansicht vergrössern (Strg++)"
            onClick={() => nextZoom && dispatch({ type: 'setZoomPercent', zoomPercent: nextZoom })}
            className="flex h-6 w-6 items-center justify-center rounded-sm hover:bg-selected disabled:opacity-40"
          >
            <Plus aria-hidden="true" size={12} />
          </button>
        </div>
      )}
      {version && <span className="shrink-0">Version {version}</span>}
    </footer>
  );
}
