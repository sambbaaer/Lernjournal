// Die fünf Hauptansichten. Bis Projekte und Journale existieren (AJ-03/AJ-05)
// zeigen sie leere Zustände mit klaren Hinweisen statt Scheinfunktionen.
import { useEffect, useRef } from 'react';
import { BookOpen, FileOutput, FilePlus, NotebookPen, Search } from 'lucide-react';
import { useApp } from '../state/AppContext';
import { commands } from '../state/commands';
import { formatShortcut } from '../state/shortcuts';
import { SettingsPanel } from '../project/SettingsPanel';
import { displayTitle, formatDate, openJournal } from '../journal/actions';
import { JournalList } from '../journal/JournalList';
import { StatusBadge } from '../journal/StatusBadge';
import type { JournalSummary } from '@shared/journal';
import { EmptyState } from './EmptyState';

function ViewFrame({
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

export function FachbuchView() {
  const { state, dispatch } = useApp();
  const searchRef = useRef<HTMLInputElement>(null);

  // Strg+Umschalt+F: Fokus ins Suchfeld, sobald die Ansicht da ist
  useEffect(() => {
    if (state.focusRequest === 'fachbuch-search') {
      searchRef.current?.focus();
      dispatch({ type: 'requestFocus', target: null });
    }
  }, [state.focusRequest, dispatch]);

  return (
    <ViewFrame title="Fachbuch">
      <div role="search" className="relative max-w-xl">
        <label htmlFor="fachbuch-search" className="sr-only">
          Im Fachbuch suchen
        </label>
        <Search
          aria-hidden="true"
          size={18}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
        />
        <input
          ref={searchRef}
          id="fachbuch-search"
          type="search"
          placeholder="Im Fachbuch suchen, z. B. «Farbmessung»"
          className="w-full rounded-sm border border-border-strong bg-surface py-2 pl-10 pr-3 text-sm placeholder:text-ink-muted"
        />
      </div>
      <EmptyState icon={BookOpen} title="Dein persönliches Fachbuch">
        Alle Journale, geordnet nach Themen und Schlagwörtern und durchsuchbar – ohne doppelte Inhalte.
        Während der IPA darfst du deine Lerndokumentation als Hilfsmittel verwenden.
      </EmptyState>
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
