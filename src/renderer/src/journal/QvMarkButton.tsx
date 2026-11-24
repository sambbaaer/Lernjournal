import { useState } from 'react';
import { Star } from 'lucide-react';
import type { JournalSummary } from '@shared/journal';
import { useApp } from '../state/AppContext';

export function QvMarkButton({ journal }: { journal: JournalSummary }) {
  const { dispatch } = useApp();
  const [saving, setSaving] = useState(false);

  async function toggle() {
    if (saving) return;
    setSaving(true);
    const journalId = journal.id;
    dispatch({ type: 'journalDetailWriteStarted', journalId });
    const result = await window.lernjournal.journal
      .setQvSelected({ id: journalId, selected: !journal.qvSelected })
      .catch(() => null);
    if (result?.ok) {
      dispatch({ type: 'journalUpserted', journal: result.data });
      dispatch({ type: 'journalDetailWriteFinished', journalId });
    } else {
      const error = 'Die QV-Markierung konnte nicht gespeichert werden.';
      dispatch({ type: 'journalDetailWriteFinished', journalId, error });
      dispatch({ type: 'notice', text: error });
    }
    setSaving(false);
  }

  return (
    <button
      type="button"
      aria-pressed={journal.qvSelected}
      aria-disabled={saving || undefined}
      onClick={() => void toggle()}
      className={`inline-flex min-h-8 items-center gap-1.5 rounded-sm border px-2 text-sm hover:bg-hover ${
        journal.qvSelected ? 'border-warning bg-warning-bg text-warning' : 'border-border-strong'
      }`}
    >
      <Star aria-hidden="true" size={15} fill={journal.qvSelected ? 'currentColor' : 'none'} />
      Für QV vormerken
    </button>
  );
}
