// Einheitlicher «Hier ist noch nichts»-Zustand mit Hinweis, was zu tun ist.
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function EmptyState({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-md border border-dashed border-border bg-surface px-6 py-10 text-center">
      <Icon aria-hidden="true" size={32} strokeWidth={1.5} className="text-ink-muted" />
      <p className="mt-3 font-semibold">{title}</p>
      <div className="mt-1 max-w-md text-sm text-ink-muted">{children}</div>
    </div>
  );
}
