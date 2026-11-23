// Status als Text mit Farbe UND Symbol (nicht nur Farbe – WCAG 1.4.1).
import { Archive, CircleCheck, PencilLine } from 'lucide-react';
import { STATUS_LABELS, type JournalSummary } from '@shared/journal';

const STYLE = {
  draft: { icon: PencilLine, cls: 'border-border-strong text-ink-muted' },
  completed: { icon: CircleCheck, cls: 'border-success text-success' },
  archived: { icon: Archive, cls: 'border-border text-ink-muted' },
} as const;

export function StatusBadge({ status }: { status: JournalSummary['status'] }) {
  const { icon: Icon, cls } = STYLE[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${cls}`}>
      <Icon aria-hidden="true" size={12} />
      {STATUS_LABELS[status]}
    </span>
  );
}
