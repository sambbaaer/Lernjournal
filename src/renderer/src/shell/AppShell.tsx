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
import { ExportDialog } from '../export/ExportDialog';
import { saveIfNeeded } from '../editor/save-registry';
import { loadJournals, loadTaxonomy } from '../journal/actions';
import { JournalDocument } from '../journal/JournalDocument';
import { NewProjectWizard } from '../project/NewProjectWizard';
import { SyncWarning } from '../project/Notices';
import { Welcome } from '../project/Welcome';
import { Backstage } from './Backstage';
import { NavigationPane } from './NavigationPane';
import { Ribbon } from './Ribbon';
import { StatusBar } from './StatusBar';

// Erstes sinnvolles Fokusziel eines Bereichs
function focusRegion(region: Region) {
  const el = document.querySelector<HTMLElement>(`[data-region="${region}"]`);
  if (!el) return;
  const preferred =
    el.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]') ??
    el.querySelector<HTMLElement>('[aria-current="page"]') ??
    (region === 'document' || region === 'statusbar' ? el : null) ??
    el.querySelector<HTMLElement>('button, [href], input, [tabindex="0"]');
  preferred?.focus();
}

function currentRegion(): Region | null {
  const el = document.activeElement?.closest<HTMLElement>('[data-region]');
  const r = el?.dataset['region'];
  return REGIONS.includes(r as Region) ? (r as Region) : null;
}

export function AppShell({ version }: { version: string | null }) {
  const { state, dispatch } = useApp();
  const fileButtonRef = useRef<HTMLButtonElement>(null);
  // Aktueller Zustand für den Tastatur-Listener (ohne ihn ständig neu anzumelden)
  const stateRef = useRef<AppState>(state);
  useLayoutEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Fenstertitel: «Fachbuch – Lernjournal» (Electron übernimmt ihn in die Titelleiste)
  useEffect(() => {
    document.title = !state.project
      ? state.wizardOpen
        ? 'Neues Lernjournal – Lernjournal'
        : 'Lernjournal'
      : state.backstage
        ? 'Datei – Lernjournal'
        : state.view === 'journal' && state.openJournal
          ? `${state.openJournal.title.trim() || 'Ohne Titel'} – Lernjournal`
          : `${VIEW_LABELS[state.view]} – Lernjournal`;
  }, [state.view, state.backstage, state.project, state.wizardOpen, state.openJournal]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const s = stateRef.current;
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

  // Journale laden, sobald ein Projekt offen ist (und bei Projektwechsel neu)
  const projectId = state.project?.id;
  useEffect(() => {
    if (!projectId) return;
    void loadJournals(dispatch);
    void loadTaxonomy(dispatch);
  }, [projectId, dispatch]);

  // Nach dem Schliessen des Datei-Menüs den Fokus zurück auf «Datei»
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !state.backstage) fileButtonRef.current?.focus();
    wasOpen.current = state.backstage !== null;
  }, [state.backstage]);

  const views = {
    start: <StartView />,
    journale: <JournaleView />,
    journal: state.openJournal ? (
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
        {/* «Zum Inhalt springen» für Tastatur und Screenreader */}
        <a
          href="#document"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:bg-surface focus:p-2"
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
              />
            )}
          </>
        )}
        <StatusBar version={version} />
      </div>
    </EditorProvider>
  );
}
