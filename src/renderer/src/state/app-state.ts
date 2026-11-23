// Zentraler Zustand der Oberfläche (ohne Journal-Daten – die kommen über IPC).
// Ein Reducer statt vieler einzelner useState: alle Zustandswechsel stehen
// an einer Stelle und lassen sich ohne Oberfläche testen.

// 'journal' = ein einzelnes Journal ist geöffnet (Dokumentansicht)
export type View = 'start' | 'journale' | 'journal' | 'fachbuch' | 'export' | 'einstellungen';
export type RibbonTab = 'start' | 'einfuegen' | 'journal' | 'exportieren' | 'tabelle';
export type BackstagePage = 'neu' | 'oeffnen' | 'exportieren' | 'einstellungen' | 'info';

import type { ProjectInfo } from '@shared/ipc';
import type { JournalDetail, JournalSummary } from '@shared/journal';
import { EMPTY_TAXONOMY, type Taxonomy } from '@shared/taxonomy';

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
  // 'journal-categories'/'journal-tags': Menüband «Journal → Ordnen» springt
  // zu den Feldern im geöffneten Journal
  focusRequest: 'fachbuch-search' | 'journal-categories' | 'journal-tags' | null;
  // Projekt: null = keines geöffnet → Startbildschirm/Assistent
  project: ProjectInfo | null;
  projectLoaded: boolean; // erster Abruf beim Start erledigt?
  recent: RecentProject[];
  suggestedLocation: string;
  // Assistent «Neues Lernjournal» sichtbar (auch wenn schon ein Projekt offen war)
  wizardOpen: boolean;
  // Cloud-Warnung für diese Sitzung ausgeblendet
  syncWarningDismissed: boolean;
  // Journale des Projekts (Übersicht, ohne Inhalt) und das geöffnete Journal
  journals: JournalSummary[];
  journalsLoaded: boolean;
  openJournal: JournalDetail | null;
  // Kategorien und Schlagwörter des Projekts (AJ-09)
  taxonomy: Taxonomy;
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
  journals: [],
  journalsLoaded: false,
  openJournal: null,
  taxonomy: EMPTY_TAXONOMY,
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
  | { type: 'dismissSyncWarning' }
  | { type: 'journalsLoaded'; journals: JournalSummary[] }
  | { type: 'journalUpserted'; journal: JournalSummary }
  | { type: 'journalRemoved'; id: string }
  | { type: 'journalOpened'; journal: JournalDetail }
  | { type: 'journalClosed' }
  | { type: 'taxonomyLoaded'; taxonomy: Taxonomy };

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
        journals: [],
        journalsLoaded: false,
        openJournal: null,
        taxonomy: EMPTY_TAXONOMY,
        notice: p.migratedFromVersion
          ? 'Projekt auf das neue Datenformat aktualisiert. Eine Sicherung liegt im Ordner «backups».'
          : null,
      };
    }
    case 'projectClosed':
      return {
        ...state,
        project: null,
        backstage: null,
        view: 'start',
        notice: null,
        journals: [],
        journalsLoaded: false,
        openJournal: null,
        taxonomy: EMPTY_TAXONOMY,
      };
    case 'profileUpdated':
      return state.project ? { ...state, project: { ...state.project, profile: action.profile } } : state;
    case 'openWizard':
      return { ...state, wizardOpen: true, backstage: null };
    case 'closeWizard':
      return { ...state, wizardOpen: false };
    case 'dismissSyncWarning':
      return { ...state, syncWarningDismissed: true };
    case 'journalsLoaded':
      return { ...state, journals: action.journals, journalsLoaded: true };
    case 'journalUpserted': {
      const j = action.journal;
      const exists = state.journals.some((x) => x.id === j.id);
      const journals = exists ? state.journals.map((x) => (x.id === j.id ? j : x)) : [j, ...state.journals];
      // Geöffnetes Journal mit neuen Metadaten aktualisieren (Inhalt bleibt)
      const openJournal = state.openJournal?.id === j.id ? { ...state.openJournal, ...j } : state.openJournal;
      return { ...state, journals: sortJournals(journals), openJournal };
    }
    case 'journalRemoved':
      return {
        ...state,
        journals: state.journals.filter((x) => x.id !== action.id),
        openJournal: state.openJournal?.id === action.id ? null : state.openJournal,
        view: state.openJournal?.id === action.id ? 'journale' : state.view,
      };
    case 'journalOpened':
      return {
        ...state,
        openJournal: action.journal,
        view: 'journal',
        backstage: null,
        saveStatus: { kind: 'idle' },
      };
    case 'journalClosed':
      return { ...state, openJournal: null, saveStatus: { kind: 'idle' } };
    case 'taxonomyLoaded':
      return { ...state, taxonomy: action.taxonomy };
  }
}

// Anzahl Journale für die Anzeige. Sobald die Liste geladen ist, zählt sie –
// sie wird bei jedem Anlegen/Duplizieren/Löschen nachgeführt. Der Wert aus
// ProjectInfo stammt vom Öffnen des Projekts und veraltet danach (Bug: «0»
// in den Einstellungen trotz vorhandener Journale).
export function journalCounts(state: AppState): { total: number; archived: number } {
  if (!state.journalsLoaded) return { total: state.project?.journalCount ?? 0, archived: 0 };
  return {
    total: state.journals.length,
    archived: state.journals.filter((j) => j.status === 'archived').length,
  };
}

// Neuestes Arbeitsdatum zuerst, bei Gleichstand zuletzt geändert zuerst
export function sortJournals(list: JournalSummary[]): JournalSummary[] {
  return [...list].sort(
    (a, b) => b.workDate.localeCompare(a.workDate) || b.updatedAt.localeCompare(a.updatedAt),
  );
}

export const VIEW_LABELS: Record<View, string> = {
  start: 'Start',
  journale: 'Journale',
  journal: 'Journal',
  fachbuch: 'Fachbuch',
  export: 'Export',
  einstellungen: 'Einstellungen',
};
