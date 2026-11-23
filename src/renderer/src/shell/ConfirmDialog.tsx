// Modaler Bestätigungsdialog (z. B. «Journal löschen?»).
// Fokus startet auf «Abbrechen» (sichere Wahl), Esc bricht ab, Tab bleibt im Dialog.
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';

export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<Element | null>(null);

  useEffect(() => {
    returnFocus.current = document.activeElement;
    cancelRef.current?.focus();
    return () => (returnFocus.current as HTMLElement | null)?.focus?.();
  }, []);

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    } else if (e.key === 'Tab') {
      // Nur zwei Knöpfe: zwischen ihnen hin und her
      e.preventDefault();
      (document.activeElement === cancelRef.current ? confirmRef : cancelRef).current?.focus();
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30" onKeyDown={onKeyDown}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
        className="w-full max-w-md rounded-md bg-surface p-6 shadow-xl"
      >
        <h2 id="confirm-title" className="text-lg font-semibold">
          {title}
        </h2>
        <div id="confirm-body" className="mt-2 text-sm">
          {children}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="rounded-sm border border-border-strong px-4 py-2 text-sm hover:bg-hover"
          >
            Abbrechen
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className={`rounded-sm px-4 py-2 text-sm font-semibold text-white ${danger ? 'bg-danger hover:opacity-90' : 'bg-accent hover:bg-accent-strong'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
