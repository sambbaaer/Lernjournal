// Die fünf Hauptansichten. Bis Projekte und Journale existieren (AJ-03/AJ-05)
// zeigen sie leere Zustände mit klaren Hinweisen statt Scheinfunktionen.
import { useEffect, useRef } from 'react';
import { BookOpen, FileOutput, FilePlus, NotebookPen, Search, Settings } from 'lucide-react';
import { useApp } from '../state/AppContext';
import { commands } from '../state/commands';
import { formatShortcut } from '../state/shortcuts';
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

export function StartView() {
  return (
    <ViewFrame title="Willkommen" actions={<NewJournalButton />}>
      <section aria-labelledby="start-recent">
        <h2 id="start-recent" className="mb-2 text-base font-semibold">
          Zuletzt bearbeitet
        </h2>
        <EmptyState icon={NotebookPen} title="Noch keine Journale">
          Halte nach einem Auftrag fest, was du gemacht hast, wie du vorgegangen bist und was du gelernt hast.
          Ein Klick auf «Neues Journal» genügt.
        </EmptyState>
      </section>
      <div className="grid gap-6 md:grid-cols-2">
        <section aria-labelledby="start-drafts">
          <h2 id="start-drafts" className="mb-2 text-base font-semibold">
            Entwürfe
          </h2>
          <p className="text-sm text-ink-muted">Keine Entwürfe.</p>
        </section>
        <section aria-labelledby="start-done">
          <h2 id="start-done" className="mb-2 text-base font-semibold">
            Abgeschlossen
          </h2>
          <p className="text-sm text-ink-muted">Noch keine abgeschlossenen Journale.</p>
        </section>
      </div>
    </ViewFrame>
  );
}

export function JournaleView() {
  return (
    <ViewFrame title="Journale" actions={<NewJournalButton />}>
      <EmptyState icon={NotebookPen} title="Hier erscheinen deine Journale">
        Sortieren und filtern nach Datum, Lehrjahr, Status, Lernort, Kategorie und Schlagwort.
      </EmptyState>
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
      <EmptyState icon={Settings} title="Profil, Speicherort und Backups">
        Verfügbar, sobald ein Projekt geöffnet ist.
      </EmptyState>
    </ViewFrame>
  );
}
