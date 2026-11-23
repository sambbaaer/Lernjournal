// Hauptansichten Start, Journale, Export und Einstellungen. Das Fachbuch
// (AJ-11) liegt in src/renderer/src/fachbuch/. Noch nicht umgesetzte
// Ansichten zeigen leere Zustände mit klaren Hinweisen statt Scheinfunktionen.
import { FileOutput, FilePlus, NotebookPen } from 'lucide-react';
import { useApp } from '../state/AppContext';
import { commands } from '../state/commands';
import { formatShortcut } from '../state/shortcuts';
import { SettingsPanel } from '../project/SettingsPanel';
import { displayTitle, formatDate, openJournal } from '../journal/actions';
import { JournalList } from '../journal/JournalList';
import { StatusBadge } from '../journal/StatusBadge';
import type { JournalSummary } from '@shared/journal';
import { EmptyState } from './EmptyState';

export function ViewFrame({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-8 py-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {actions}
      </div>
      {children}
    </div>
  );
}

function NewJournalButton() {
  const { state, dispatch } = useApp();
  const cmd = commands['journal.new'];
  return (
    <button
      type="button"
      onClick={() => cmd.run(state, dispatch)}
      title={`${cmd.label} (${formatShortcut(cmd.shortcut!)})`}
      aria-keyshortcuts={cmd.shortcut}
      className="flex items-center gap-2 rounded-sm bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-strong"
    >
      <FilePlus aria-hidden="true" size={18} /> {cmd.label}
    </button>
  );
}

function JournalLinks({ items, empty }: { items: JournalSummary[]; empty: string }) {
  const { dispatch } = useApp();
  if (items.length === 0) return <p className="text-sm text-ink-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-border-subtle rounded-md border border-border bg-surface">
      {items.map((j) => (
        <li key={j.id}>
          <button
            type="button"
            onClick={() => void openJournal(dispatch, j.id)}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-hover"
          >
            <span
              className={`min-w-0 flex-1 truncate ${j.title.trim() ? 'font-semibold' : 'italic text-ink-muted'}`}
            >
              {displayTitle(j.title)}
            </span>
            <span className="shrink-0 tabular-nums text-ink-muted">{formatDate(j.workDate)}</span>
            <StatusBadge status={j.status} />
          </button>
        </li>
      ))}
    </ul>
  );
}

export function StartView() {
  const { state } = useApp();
  const name = state.project?.profile.displayName.trim();
  const active = state.journals.filter((j) => j.status !== 'archived');
  const recent = [...active].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);
  const drafts = active.filter((j) => j.status === 'draft').slice(0, 5);
  const done = active.filter((j) => j.status === 'completed').slice(0, 5);
  return (
    <ViewFrame
      title={name ? `Willkommen, ${name.split(' ')[0]}` : 'Willkommen'}
      actions={<NewJournalButton />}
    >
      <section aria-labelledby="start-recent">
        <h2 id="start-recent" className="mb-2 text-base font-semibold">
          Zuletzt bearbeitet
        </h2>
        {recent.length === 0 ? (
          <EmptyState icon={NotebookPen} title="Noch keine Journale">
            Halte nach einem Auftrag fest, was du gemacht hast, wie du vorgegangen bist und was du gelernt
            hast. Ein Klick auf «Neues Journal» genügt.
          </EmptyState>
        ) : (
          <JournalLinks items={recent} empty="" />
        )}
      </section>
      <div className="grid gap-6 md:grid-cols-2">
        <section aria-labelledby="start-drafts">
          <h2 id="start-drafts" className="mb-2 text-base font-semibold">
            Entwürfe
          </h2>
          <JournalLinks items={drafts} empty="Keine Entwürfe." />
        </section>
        <section aria-labelledby="start-done">
          <h2 id="start-done" className="mb-2 text-base font-semibold">
            Abgeschlossen
          </h2>
          <JournalLinks items={done} empty="Noch keine abgeschlossenen Journale." />
        </section>
      </div>
    </ViewFrame>
  );
}

export function JournaleView() {
  return (
    <ViewFrame title="Journale" actions={<NewJournalButton />}>
      <JournalList />
    </ViewFrame>
  );
}

export function ExportView() {
  return (
    <ViewFrame title="Export">
      <EmptyState icon={FileOutput} title="Journale als Word-Dokument ausgeben">
        Einzelne Journale oder eine Sammlung mit Titelseite und Inhaltsverzeichnis. Word-Dateien sind ein
        Ausgabeformat – Änderungen darin fliessen nicht in Lernjournal zurück.
      </EmptyState>
    </ViewFrame>
  );
}

export function EinstellungenView() {
  return (
    <ViewFrame title="Einstellungen">
      <SettingsPanel />
    </ViewFrame>
  );
}
