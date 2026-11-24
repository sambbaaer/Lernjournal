// Gesamtlayout im Office-Stil:
//   ┌ Menüband (Datei + Register + Befehle) ───────────────┐
//   │ Navigation │ Dokumentfläche (aktuelle Ansicht)        │
//   └ Statusleiste ────────────────────────────────────────┘
// Ausserdem: globale Tastenkürzel und F6-Bereichswechsel.
import { useEffect, useLayoutEffect, useRef } from 'react';
import { useApp } from '../state/AppContext';
import { VIEW_LABELS, type AppState } from '../state/app-state';
import { commands } from '../state/commands';
import { nextRegion, REGIONS, type Region } from '../state/regions';
import { matchesShortcut } from '../state/shortcuts';
import { FachbuchView } from '../fachbuch/FachbuchView';
import { EinstellungenView, ExportView, JournaleView, StartView } from '../views/Views';
import { EditorProvider } from '../editor/EditorContext';
import { ArchiveDialog } from '../archive/ArchiveDialog';
import { ExportReminderBar } from '../backup/ExportReminderBar';
import { RestoreDialog } from '../backup/RestoreDialog';
import { ExportDialog } from '../export/ExportDialog';
import { saveIfNeeded } from '../editor/save-registry';
import { loadJournals, loadTaxonomy } from '../journal/actions';
import { JournalDocument } from '../journal/JournalDocument';
import { JournalTemplateDialog } from '../journal/JournalTemplateDialog';
import { NewJournalPending } from '../journal/NewJournalPending';
import { NewProjectWizard } from '../project/NewProjectWizard';
import { SyncWarning } from '../project/Notices';
import { Welcome } from '../project/Welcome';
import { Backstage } from './Backstage';
import { NavigationPane } from './NavigationPane';
import { Ribbon } from './Ribbon';
import { StatusBar } from './StatusBar';
import { WindowTitleBar } from './WindowTitleBar';

// Erstes sinnvolles Fokusziel eines Bereichs
function focusRegion(region: Region) {
  const el = document.querySelector<HTMLElement>(`[data-region="${region}"]`);
  if (!el) return;
  const preferred =
    el.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]') ??
    el.querySelector<HTMLElement>('[aria-current="page"]') ??
    (region === 'document' ? el : null) ??
    el.querySelector<HTMLElement>('button, [href], input, [tabindex="0"]') ??
    (region === 'statusbar' ? el : null);
  preferred?.focus();
}

function currentRegion(): Region | null {
  const el = document.activeElement?.closest<HTMLElement>('[data-region]');
  const r = el?.dataset['region'];
  return REGIONS.includes(r as Region) ? (r as Region) : null;
}

function windowContextOf(state: AppState): string | null {
  if (state.wizardOpen) return 'Neues Lernjournal';
  if (!state.project) return null;
  if (state.backstage) return 'Datei';
  if (state.view === 'journal') {
    return state.creatingJournal ? 'Neues Journal' : state.openJournal?.title.trim() || 'Ohne Titel';
  }
  return VIEW_LABELS[state.view];
}

export function AppShell({ version }: { version: string | null }) {
  const { state, dispatch } = useApp();
  const fileButtonRef = useRef<HTMLButtonElement>(null);
  // Aktueller Zustand für den Tastatur-Listener (ohne ihn ständig neu anzumelden)
  const stateRef = useRef<AppState>(state);
  useLayoutEffect(() => {
    stateRef.current = state;
  }, [state]);

  const windowContext = windowContextOf(state);

  // Auch der System-Fenstertitel (z. B. Alt+Tab) folgt dem aktuellen Inhalt.
  useEffect(() => {
    document.title = windowContext ? `${windowContext} – Lernjournal` : 'Lernjournal';
  }, [windowContext]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const s = stateRef.current;
      if (s.journalTemplatesOpen || s.journalSectionForm) return;
      // Esc schliesst das Datei-Menü, egal wo der Fokus gerade ist
      if (e.key === 'Escape' && s.backstage) {
        e.preventDefault();
        dispatch({ type: 'closeBackstage' });
        return;
      }
      // Ohne geöffnetes Projekt (Startbildschirm/Assistent) keine App-Kürzel
      if (!s.project || s.wizardOpen) return;
      // F6 / Umschalt+F6: zwischen Bereichen springen (nicht im Datei-Menü)
      if (e.key === 'F6' && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        if (s.backstage) return;
        focusRegion(nextRegion(currentRegion(), e.shiftKey));
        return;
      }
      for (const cmd of Object.values(commands)) {
        if (!cmd.shortcut || cmd.id.startsWith('region.')) continue;
        if (matchesShortcut(e, cmd.shortcut)) {
          e.preventDefault(); // auch bei nicht verfügbaren Befehlen: kein Browser-Standardverhalten
          if (!cmd.disabledReason(s)) cmd.run(s, dispatch);
          return;
        }
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dispatch]);

  // Fenster wird geschlossen: Ausstehendes speichern und dem Hauptprozess melden
  useEffect(
    () =>
      window.lernjournal.app.onBeforeClose(() => {
        void saveIfNeeded()
          .catch(() => false)
          .then((saved) => window.lernjournal.app.closeReady({ saved }));
      }),
    [],
  );

  // Journale laden, sobald ein Projekt offen ist (und bei Projektwechsel neu).
  // Schlüssel mit Pfad: Eine importierte Kopie (AJ-14) hat dieselbe Projekt-ID
  // wie das Original, liegt aber in einem anderen Ordner. Mit projectEpoch:
  // auch nach erneutem Öffnen desselben Projekts (Ersetzen durch eine
  // Sicherung, AJ-15) neu laden.
  const projectKey = state.project ? `${state.project.id}|${state.project.path}|${state.projectEpoch}` : null;
  useEffect(() => {
    if (!projectKey) return;
    void loadJournals(dispatch);
    void loadTaxonomy(dispatch);
  }, [projectKey, dispatch]);

  // Ohne neues Fokusziel kehrt der Fokus nach dem Datei-Menü zu «Datei» zurück.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !state.backstage && !state.focusRequest) fileButtonRef.current?.focus();
    wasOpen.current = state.backstage !== null;
  }, [state.backstage, state.focusRequest]);

  const views = {
    start: <StartView />,
    journale: <JournaleView />,
    journal: state.creatingJournal ? (
      <NewJournalPending />
    ) : state.openJournal ? (
      <JournalDocument key={state.openJournal.id} journal={state.openJournal} />
    ) : (
      <JournaleView />
    ),
    fachbuch: <FachbuchView />,
    export: <ExportView />,
    einstellungen: <EinstellungenView />,
  };

  return (
    <EditorProvider>
      <div className="flex h-full flex-col">
        <WindowTitleBar context={windowContext} />
        {/* «Zum Inhalt springen» für Tastatur und Screenreader */}
        <a
          href="#document"
          className="skip-link sr-only focus:not-sr-only focus:absolute focus:left-2 focus:z-50 focus:bg-surface focus:p-2"
        >
          Zum Inhalt springen
        </a>
        {!state.projectLoaded ? (
          <main
            className="flex flex-1 items-center justify-center bg-canvas text-sm text-ink-muted"
            aria-busy="true"
          >
            Lädt …
          </main>
        ) : state.wizardOpen ? (
          <NewProjectWizard />
        ) : !state.project ? (
          <Welcome />
        ) : state.backstage ? (
          <Backstage
            page={state.backstage}
            version={version}
            onClose={() => dispatch({ type: 'closeBackstage' })}
          />
        ) : (
          <>
            <Ribbon fileButtonRef={fileButtonRef} />
            {state.project.syncProvider && !state.syncWarningDismissed && (
              <SyncWarning
                provider={state.project.syncProvider}
                onDismiss={() => dispatch({ type: 'dismissSyncWarning' })}
              />
            )}
            {/* Erinnerung an eine Kopie ausserhalb des Computers (AJ-15) */}
            <ExportReminderBar />
            <div className="flex min-h-0 flex-1">
              <NavigationPane />
              <main
                id="document"
                // relative: Bezugsrahmen für absolut positionierte Elemente (z. B.
                // unsichtbare Screenreader-Labels «sr-only»). Ohne ihn zählen sie zur
                // Fensterhöhe, das ganze Fenster wird scrollbar und Menüband/Statusleiste
                // können beim Springen aus dem Bild rutschen.
                data-region="document"
                tabIndex={-1}
                aria-label={VIEW_LABELS[state.view]}
                className="min-w-0 flex-1 relative overflow-auto bg-canvas"
              >
                {views[state.view]}
              </main>
            </div>
            {/* Word-Export (AJ-12/13): Hinweis R-10 → Speichern → Ergebnis */}
            {state.exportDialog && (
              <ExportDialog
                journalIds={state.exportDialog.journalIds}
                collection={state.exportDialog.collection}
                format={state.exportDialog.format}
              />
            )}
          </>
        )}
        <StatusBar version={version} />
        {/* Projektübergabe .ajournal (AJ-14): auch auf dem Startbildschirm (Import) */}
        {state.archiveDialog && <ArchiveDialog mode={state.archiveDialog} />}
        {state.journalTemplatesOpen && <JournalTemplateDialog />}
        {/* Wiederherstellung (AJ-15): bleibt über das erneute Öffnen hinweg stehen */}
        {state.restoreDialog && (
          <RestoreDialog key={state.restoreDialog.backupId} backupId={state.restoreDialog.backupId} />
        )}
      </div>
    </EditorProvider>
  );
}
