// Zentraler Zustand der Oberfläche (ohne Journal-Daten – die kommen über IPC).
// Ein Reducer statt vieler einzelner useState: alle Zustandswechsel stehen
// an einer Stelle und lassen sich ohne Oberfläche testen.

export type View = 'start' | 'journale' | 'fachbuch' | 'export' | 'einstellungen';
export type RibbonTab = 'start' | 'einfuegen' | 'journal' | 'exportieren';
export type BackstagePage = 'neu' | 'oeffnen' | 'exportieren' | 'einstellungen' | 'info';

import type { ProjectInfo } from '@shared/ipc';

export type RecentProject = { path: string; title: string; lastOpened: string };

// Speicherstatus: nur Zustände, die auch WIRKLICH zutreffen dürfen (SPEC).
// 'idle' = nichts zu speichern; die Statusleiste zeigt dann keinen Speicherhinweis.
export type SaveStatus =
  { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved'; at: number } | { kind: 'error'; message: string };

export type AppState = {
  view: View;
  ribbonTab: RibbonTab;
  backstage: BackstagePage | null; // null = Datei-Menü geschlossen
  saveStatus: SaveStatus;
  // Kurze Meldung in der Statusleiste (z. B. «Folgt in einem späteren Schritt»)
  notice: string | null;
  // Fokuswunsch, den eine Ansicht nach dem Rendern erfüllt (z. B. Suchfeld)
  focusRequest: 'fachbuch-search' | null;
  // Projekt: null = keines geöffnet → Startbildschirm/Assistent
  project: ProjectInfo | null;
  projectLoaded: boolean; // erster Abruf beim Start erledigt?
  recent: RecentProject[];
  suggestedLocation: string;
  // Assistent «Neues Lernjournal» sichtbar (auch wenn schon ein Projekt offen war)
  wizardOpen: boolean;
  // Cloud-Warnung für diese Sitzung ausgeblendet
  syncWarningDismissed: boolean;
};

export const initialState: AppState = {
  view: 'start',
  ribbonTab: 'start',
  backstage: null,
  saveStatus: { kind: 'idle' },
  notice: null,
  focusRequest: null,
  project: null,
  projectLoaded: false,
  recent: [],
  suggestedLocation: '',
  wizardOpen: false,
  syncWarningDismissed: false,
};

export type Action =
  | { type: 'navigate'; view: View }
  | { type: 'selectRibbonTab'; tab: RibbonTab }
  | { type: 'openBackstage'; page?: BackstagePage }
  | { type: 'closeBackstage' }
  | { type: 'setSaveStatus'; status: SaveStatus }
  | { type: 'notice'; text: string | null }
  | { type: 'requestFocus'; target: AppState['focusRequest'] }
  | { type: 'projectState'; project: ProjectInfo | null; recent: RecentProject[]; suggestedLocation: string }
  | { type: 'projectOpened'; project: ProjectInfo }
  | { type: 'projectClosed' }
  | { type: 'profileUpdated'; profile: ProjectInfo['profile'] }
  | { type: 'openWizard' }
  | { type: 'closeWizard' }
  | { type: 'dismissSyncWarning' };

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'navigate':
      // Navigieren schliesst das Datei-Menü, wie in Office
      return { ...state, view: action.view, backstage: null, notice: null };
    case 'selectRibbonTab':
      return { ...state, ribbonTab: action.tab };
    case 'openBackstage':
      return { ...state, backstage: action.page ?? 'neu' };
    case 'closeBackstage':
      return { ...state, backstage: null };
    case 'setSaveStatus':
      return { ...state, saveStatus: action.status };
    case 'notice':
      return { ...state, notice: action.text };
    case 'requestFocus':
      return { ...state, focusRequest: action.target };
    case 'projectState':
      return {
        ...state,
        project: action.project,
        recent: action.recent,
        suggestedLocation: action.suggestedLocation,
        projectLoaded: true,
      };
    case 'projectOpened': {
      const p = action.project;
      const recent = [
        { path: p.path, title: p.title, lastOpened: new Date().toISOString() },
        ...state.recent.filter((r) => r.path.toLowerCase() !== p.path.toLowerCase()),
      ].slice(0, 10);
      return {
        ...state,
        project: p,
        recent,
        wizardOpen: false,
        backstage: null,
        view: 'start',
        syncWarningDismissed: false,
        notice: p.migratedFromVersion
          ? 'Projekt auf das neue Datenformat aktualisiert. Eine Sicherung liegt im Ordner «backups».'
          : null,
      };
    }
    case 'projectClosed':
      return { ...state, project: null, backstage: null, view: 'start', notice: null };
    case 'profileUpdated':
      return state.project ? { ...state, project: { ...state.project, profile: action.profile } } : state;
    case 'openWizard':
      return { ...state, wizardOpen: true, backstage: null };
    case 'closeWizard':
      return { ...state, wizardOpen: false };
    case 'dismissSyncWarning':
      return { ...state, syncWarningDismissed: true };
  }
}

export const VIEW_LABELS: Record<View, string> = {
  start: 'Start',
  journale: 'Journale',
  fachbuch: 'Fachbuch',
  export: 'Export',
  einstellungen: 'Einstellungen',
};
