// Hauptansichten Start, Journale, Export und Einstellungen. Das Fachbuch
// (AJ-11) liegt in src/renderer/src/fachbuch/. Noch nicht umgesetzte
// Ansichten zeigen leere Zustände mit klaren Hinweisen statt Scheinfunktionen.
import { useState } from 'react';
import type { ExportFormat } from '@shared/export';
import { FileDown, FilePlus, NotebookPen } from 'lucide-react';
import { CollectionPanel } from '../export/CollectionPanel';
import { useApp } from '../state/AppContext';
import { commands } from '../state/commands';
import { formatShortcut } from '../state/shortcuts';
import { SettingsTabs } from '../project/SettingsTabs';
import { displayTitle, formatDate, openJournal } from '../journal/actions';
import { JournalList } from '../journal/JournalList';
import { JournalPicker } from '../journal/JournalPicker';
import { StatusBadge } from '../journal/StatusBadge';
import type { JournalSummary } from '@shared/journal';
import { EmptyState } from './EmptyState';
import { startLists, startProgress, type StartProgress } from './start-progress';

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
      <div className="flex flex-wrap items-center justify-between gap-4">
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
      className="flex items-center gap-2 rounded-sm bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-action-hover"
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
  const { state, dispatch } = useApp();
  const name = state.project?.profile.displayName.trim();
  // AJ-24: keine Doppelungen zwischen den Listen, Fortschritt rechts
  const { recent, openDrafts } = startLists(state.journals);
  const progress = startProgress(
    state.journals,
    state.project?.profile.apprenticeshipStart ?? null,
    state.qvMinimum,
  );
  return (
    <ViewFrame
      title={name ? `Willkommen, ${name.split(' ')[0]}` : 'Willkommen'}
      actions={<NewJournalButton />}
    >
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-6">
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
          {openDrafts.length > 0 && (
            <section aria-labelledby="start-drafts">
              <h2 id="start-drafts" className="mb-2 text-base font-semibold">
                Weitere offene Entwürfe
              </h2>
              <JournalLinks items={openDrafts} empty="" />
            </section>
          )}
        </div>
        {progress.total > 0 && (
          <ProgressPanel
            progress={progress}
            onSettings={() => dispatch({ type: 'navigate', view: 'einstellungen' })}
          />
        )}
      </div>
    </ViewFrame>
  );
}

// Fortschritt (AJ-24): kompakte Kennzahlen statt doppelter Listen. Die
// Balken sind Schmuck (aria-hidden); die Zahlen stehen immer auch als Text da.
function ProgressPanel({ progress, onSettings }: { progress: StartProgress; onSettings: () => void }) {
  const { total, drafts, completed, qvSelected, qvMinimum, years, withoutYear } = progress;
  const max = Math.max(1, ...years.flatMap((y) => [y.semester1, y.semester2, y.withoutSemester]));
  const qvPercent = Math.min(100, Math.round((qvSelected / Math.max(1, qvMinimum)) * 100));
  const anyYear = years.some((y) => y.total > 0);
  return (
    <aside
      aria-labelledby="start-progress"
      className="space-y-5 rounded-lg border border-border bg-surface p-4"
    >
      <h2 id="start-progress" className="text-base font-semibold">
        Fortschritt
      </h2>
      {/* Kennzahlen als Zeilen (Bezeichnung links, Zahl rechts): passt auch bei
          grosser Schrift und 200 % Zoom, ohne dass Wörter aus Kacheln ragen */}
      <dl className="divide-y divide-border-subtle rounded-sm bg-canvas px-3 text-sm">
        {(
          [
            ['Journale', total],
            ['Entwürfe', drafts],
            ['Abgeschlossen', completed],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-2 py-1.5">
            <dt className="text-ink-muted">{label}</dt>
            <dd className="text-base font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="space-y-1.5">
        <h3 className="text-sm font-semibold">Für das QV vorgemerkt</h3>
        <p className="text-sm">
          <strong className="tabular-nums">{qvSelected}</strong> von mindestens{' '}
          <span className="tabular-nums">{qvMinimum}</span> Lernberichten
        </p>
        <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-canvas">
          <div
            className={`h-full rounded-full ${qvSelected >= qvMinimum ? 'bg-success' : 'bg-accent'}`}
            style={{ width: `${qvPercent}%` }}
          />
        </div>
        <p className="text-xs text-ink-muted">
          Mindestzahl anpassen unter{' '}
          <button type="button" className="text-accent underline" onClick={onSettings}>
            Einstellungen
          </button>
          .
        </p>
      </div>
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Journale pro Semester</h3>
        {anyYear ? (
          <ul className="space-y-2">
            {years
              .filter((y) => y.total > 0)
              .map((y) => (
                <li key={y.year} className="space-y-1">
                  <p className="text-xs font-semibold">
                    {y.year}. Lehrjahr · {y.total} {y.total === 1 ? 'Journal' : 'Journale'}
                  </p>
                  {(
                    [
                      ['1. Semester', y.semester1],
                      ['2. Semester', y.semester2],
                      ['Ohne Semester', y.withoutSemester],
                    ] as const
                  )
                    .filter(([label, count]) => label !== 'Ohne Semester' || count > 0)
                    .map(([label, count]) => (
                      <div key={label} className="flex items-center gap-2 text-xs">
                        <span className="w-24 shrink-0 text-ink-muted">{label}</span>
                        <span
                          aria-hidden="true"
                          className="h-2 flex-1 overflow-hidden rounded-full bg-canvas"
                        >
                          <span
                            className="block h-full rounded-full bg-accent"
                            style={{ width: `${(count / max) * 100}%` }}
                          />
                        </span>
                        <span className="w-6 text-right tabular-nums">{count}</span>
                      </div>
                    ))}
                </li>
              ))}
          </ul>
        ) : (
          <p className="text-xs text-ink-muted">
            Trage im Profil deinen Lehrbeginn ein. Dann ordnet Lernjournal die Journale den Lehrjahren und
            Semestern zu.
          </p>
        )}
        {anyYear && withoutYear > 0 && (
          <p className="text-xs text-ink-muted">
            {withoutYear} {withoutYear === 1 ? 'Journal' : 'Journale'} ohne Lehrjahr
          </p>
        )}
      </div>
    </aside>
  );
}

export function JournaleView() {
  return (
    <ViewFrame title="Journale" actions={<NewJournalButton />}>
      <JournalList />
    </ViewFrame>
  );
}

const NO_IDS: string[] = []; // stabile Referenz (keine neue Liste bei jedem Rendern)

// Export: Einzel-DOCX (AJ-12) und Sammel-DOCX mit Titelseite und
// Inhaltsverzeichnis (AJ-13, export/CollectionPanel.tsx).
export function ExportView() {
  const { state, dispatch } = useApp();
  const [picking, setPicking] = useState<ExportFormat | null>(null);
  const none = state.journals.length === 0;
  return (
    <ViewFrame title="Export">
      <section
        aria-labelledby="export-single"
        className="space-y-3 rounded-md border border-border bg-surface p-5"
      >
        <h2 id="export-single" className="flex items-center gap-2 text-base font-semibold">
          <FileDown aria-hidden="true" size={18} /> Ein Journal exportieren
        </h2>
        <p className="text-sm">Als PDF zum Weitergeben oder als Word-Dokument zum Weiterbearbeiten.</p>
        {none ? (
          <p className="text-sm text-ink-muted">Noch keine Journale zum Exportieren.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPicking('pdf')}
              className="rounded-sm bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-action-hover"
            >
              Journal als PDF wählen …
            </button>
            <button
              type="button"
              onClick={() => setPicking('docx')}
              className="rounded-sm border border-border-strong px-4 py-2 text-sm hover:bg-hover"
            >
              Journal wählen und exportieren …
            </button>
          </div>
        )}
      </section>
      <CollectionPanel />
      {picking && (
        <JournalPicker
          title={`Journal als ${picking === 'pdf' ? 'PDF' : 'Word'} exportieren`}
          confirmLabel="Weiter"
          excludeIds={NO_IDS}
          onCancel={() => setPicking(null)}
          onPick={(id) => {
            setPicking(null);
            dispatch({ type: 'openExport', format: picking, journalIds: [id] });
          }}
        />
      )}
    </ViewFrame>
  );
}

export function EinstellungenView() {
  return (
    <ViewFrame title="Einstellungen">
      <SettingsTabs />
    </ViewFrame>
  );
}
