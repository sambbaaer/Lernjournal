// Statusleiste unten: Speicherstatus, Hinweise, Offline-Kennzeichen.
// Speichertexte erscheinen NUR, wenn sie zutreffen (SPEC) – im Leerlauf nichts.
import { CircleAlert, LoaderCircle, Check, WifiOff } from 'lucide-react';
import { saveNow } from '../editor/save-registry';
import { useApp } from '../state/AppContext';
import type { SaveStatus } from '../state/app-state';

function SaveIndicator({ status }: { status: SaveStatus }) {
  switch (status.kind) {
    case 'idle':
      return null;
    case 'saving':
      return (
        <span className="flex items-center gap-1">
          <LoaderCircle aria-hidden="true" size={14} className="animate-spin" />
          Speichert …
        </span>
      );
    case 'saved':
      return (
        <span
          className="flex items-center gap-1"
          data-saved-at={status.at}
          title={`Zuletzt gespeichert um ${new Date(status.at).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`}
        >
          <Check aria-hidden="true" size={14} />
          Gespeichert
        </span>
      );
    case 'error':
      return (
        <span className="flex items-center gap-1 font-semibold text-danger">
          <CircleAlert aria-hidden="true" size={14} />
          Speichern fehlgeschlagen. {status.message}
          <button
            type="button"
            onClick={() => void saveNow()}
            className="ml-1 rounded-sm border border-danger px-2 py-0.5 font-semibold hover:bg-danger-bg"
          >
            Erneut versuchen
          </button>
        </span>
      );
  }
}

export function StatusBar({ version }: { version: string | null }) {
  const { state } = useApp();
  return (
    <footer
      data-region="statusbar"
      aria-label="Statusleiste"
      tabIndex={-1}
      className="flex h-7 shrink-0 items-center justify-between gap-4 border-t border-border bg-surface px-3 text-xs text-ink-muted"
    >
      {/* aria-live: Screenreader lesen Änderungen vor, ohne dass man hinspringen muss */}
      <div className="flex min-w-0 items-center gap-4" aria-live="polite" data-testid="statusbar-live">
        <SaveIndicator status={state.saveStatus} />
        {state.notice && <span className="truncate">{state.notice}</span>}
      </div>
      <div className="flex shrink-0 items-center gap-4">
        {state.project && (
          <span className="max-w-64 truncate" title={state.project.path}>
            {state.project.title}
          </span>
        )}
        <span className="flex items-center gap-1" title="Lernjournal arbeitet ohne Internet und ohne Konto">
          <WifiOff aria-hidden="true" size={14} />
          Offline
        </span>
        {version && <span>Version {version}</span>}
      </div>
    </footer>
  );
}
