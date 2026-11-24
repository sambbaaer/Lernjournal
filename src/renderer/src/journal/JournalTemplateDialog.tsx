import { useId, useLayoutEffect, useRef } from 'react';
import { ClipboardList, File, Footprints, Table2 } from 'lucide-react';
import { JOURNAL_TEMPLATE_IDS, type JournalTemplateId } from '@shared/journal';
import { JOURNAL_TEMPLATES } from '@shared/journal-templates';
import { useApp } from '../state/AppContext';
import { createJournal } from './actions';

const icons = { report: ClipboardList, blank: File, machine: Table2, workflow: Footprints };

export function JournalTemplateChoices({ onChoose }: { onChoose: (id: JournalTemplateId) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {JOURNAL_TEMPLATE_IDS.map((id) => {
        const { label, description } = JOURNAL_TEMPLATES[id];
        const Icon = icons[id];
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChoose(id)}
            className="flex items-start gap-3 rounded-lg border border-border-strong p-4 text-left hover:border-accent hover:bg-selected focus-visible:outline-offset-2"
          >
            <Icon aria-hidden="true" size={21} className="mt-0.5 shrink-0 text-accent" />
            <span>
              <span className="block font-semibold">{label}</span>
              <span className="mt-1 block text-sm text-ink-muted">{description}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function JournalTemplateDialog() {
  const { dispatch } = useApp();
  const ref = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  function cancel() {
    dispatch({ type: 'closeJournalTemplates' });
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={headingId}
      onCancel={(event) => {
        event.preventDefault();
        cancel();
      }}
      className="m-auto max-h-[calc(100%_-_2rem)] w-[calc(100%_-_2rem)] max-w-2xl overflow-auto rounded-xl border border-border-strong bg-surface text-ink shadow-xl backdrop:bg-black/35"
    >
      <div className="border-b border-border bg-paper px-6 py-4 text-accent-strong">
        <h2 id={headingId} className="text-lg font-semibold">
          Journalvorlage wählen
        </h2>
      </div>
      <div className="p-6">
        <JournalTemplateChoices onChoose={(id) => void createJournal(dispatch, id)} />
      </div>
      <div className="flex justify-end border-t border-border px-6 py-3">
        <button
          type="button"
          onClick={cancel}
          className="rounded-md px-3 py-1.5 text-sm font-medium hover:bg-hover"
        >
          Abbrechen
        </button>
      </div>
    </dialog>
  );
}
