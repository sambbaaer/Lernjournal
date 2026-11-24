import { useId, useLayoutEffect, useRef, useState } from 'react';
import { SECTION_HEADING_MAX, type JournalTemplateId } from '@shared/journal';
import { JournalTemplateChoices } from './JournalTemplateDialog';

export function JournalSectionForm({
  current,
  onSubmit,
  onChooseTemplate,
  onCancel,
}: {
  current?: string | null;
  onSubmit: (heading: string | null) => void;
  onChooseTemplate?: (id: JournalTemplateId) => void;
  onCancel: () => void;
}) {
  const [heading, setHeading] = useState(current ?? '');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const adding = current === undefined;
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    dialog.querySelector('input')?.select();
    return () => dialog.close();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      className={`m-auto max-h-[calc(100%_-_2rem)] w-[calc(100%_-_2rem)] overflow-auto rounded-xl border border-border-strong bg-surface p-5 text-ink shadow-xl backdrop:bg-black/35 ${adding ? 'max-w-2xl' : 'max-w-md'}`}
    >
      <h2 id={titleId} className="text-lg font-semibold">
        {adding ? 'Abschnitt hinzufügen' : 'Abschnitt umbenennen'}
      </h2>
      <form
        className="mt-4 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(heading.trim() || null);
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          Überschrift (optional)
          <input
            value={heading}
            maxLength={SECTION_HEADING_MAX}
            onChange={(event) => setHeading(event.target.value)}
            className="rounded-md border border-border-strong bg-surface px-3 py-2"
          />
        </label>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-md px-3 py-2 text-sm hover:bg-hover">
            Abbrechen
          </button>
          <button
            type="submit"
            className="rounded-md bg-action px-3 py-2 text-sm font-semibold text-white hover:bg-action-hover"
          >
            {adding ? 'Hinzufügen' : 'Übernehmen'}
          </button>
        </div>
      </form>
      {onChooseTemplate && (
        <div className="mt-4 border-t border-border pt-4">
          <h3 className="mb-3 text-base font-semibold">Ganze Vorlage anhängen</h3>
          <JournalTemplateChoices onChoose={onChooseTemplate} />
        </div>
      )}
    </dialog>
  );
}
