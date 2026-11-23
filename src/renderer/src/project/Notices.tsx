// Hinweis- und Warnflächen (Infoleiste wie in Office).
import { CircleAlert, Cloud, Info, X } from 'lucide-react';
import type { ReactNode } from 'react';

export function SyncWarning({ provider, onDismiss }: { provider: string; onDismiss?: () => void }) {
  return (
    <div
      role="status"
      className="flex items-start gap-3 border-l-4 border-warning bg-warning-bg px-4 py-3 text-sm"
    >
      <Cloud aria-hidden="true" size={18} className="mt-0.5 shrink-0" />
      <p className="flex-1">
        <strong>Dieser Ordner wird mit {provider} synchronisiert.</strong> Das kann bei geöffnetem Projekt zu
        Konflikten oder beschädigten Dateien führen, besonders wenn du auf mehreren Computern arbeitest.
        Empfohlen: ein lokaler Ordner und regelmässige Sicherungen.
      </p>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-sm p-1 hover:bg-hover"
          aria-label="Hinweis ausblenden"
        >
          <X aria-hidden="true" size={16} />
        </button>
      )}
    </div>
  );
}

export function ErrorMessage({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 border-l-4 border-danger bg-danger-bg px-4 py-3 text-sm"
    >
      <CircleAlert aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-danger" />
      <div>{children}</div>
    </div>
  );
}

export function UnofficialHint() {
  return (
    <p className="flex items-start gap-2 border-l-4 border-accent bg-selected px-4 py-3 text-sm">
      <Info aria-hidden="true" size={18} className="mt-0.5 shrink-0" />
      <span>
        <strong>Inoffizielles Hilfsmittel.</strong> Lernjournal wird nicht von SBFI, dpsuisse oder
        Prüfungsorganen herausgegeben. Deine Daten bleiben auf deinem Computer.
      </span>
    </p>
  );
}

export function ConfirmForce({
  message,
  onConfirm,
  onCancel,
}: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="alertdialog"
      aria-labelledby="force-title"
      className="space-y-3 border-l-4 border-warning bg-warning-bg px-4 py-3 text-sm"
    >
      <p id="force-title" className="font-semibold">
        Projekt ist anderswo geöffnet
      </p>
      <p>{message}</p>
      <p>
        Wenn du es trotzdem öffnest, können Änderungen auf dem anderen Computer verloren gehen. Öffne es nur,
        wenn du sicher bist, dass es dort nicht mehr verwendet wird (z. B. nach einem Absturz).
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-sm border border-border-strong bg-surface px-3 py-1.5 font-semibold hover:bg-hover"
        >
          Trotzdem öffnen
        </button>
        <button type="button" onClick={onCancel} className="rounded-sm px-3 py-1.5 hover:bg-hover">
          Abbrechen
        </button>
      </div>
    </div>
  );
}
