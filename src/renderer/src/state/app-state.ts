// Zentraler Zustand der Oberfläche (ohne Journal-Daten – die kommen über IPC).
// Ein Reducer statt vieler einzelner useState: alle Zustandswechsel stehen
// an einer Stelle und lassen sich ohne Oberfläche testen.

export type View = 'start' | 'journale' | 'fachbuch' | 'export' | 'einstellungen';
export type RibbonTab = 'start' | 'einfuegen' | 'journal' | 'exportieren';
export type BackstagePage = 'neu' | 'oeffnen' | 'exportieren' | 'einstellungen' | 'info';

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
};

export const initialState: AppState = {
  view: 'start',
  ribbonTab: 'start',
  backstage: null,
  saveStatus: { kind: 'idle' },
  notice: null,
  focusRequest: null,
};

export type Action =
  | { type: 'navigate'; view: View }
  | { type: 'selectRibbonTab'; tab: RibbonTab }
  | { type: 'openBackstage'; page?: BackstagePage }
  | { type: 'closeBackstage' }
  | { type: 'setSaveStatus'; status: SaveStatus }
  | { type: 'notice'; text: string | null }
  | { type: 'requestFocus'; target: AppState['focusRequest'] };

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
  }
}

export const VIEW_LABELS: Record<View, string> = {
  start: 'Start',
  journale: 'Journale',
  fachbuch: 'Fachbuch',
  export: 'Export',
  einstellungen: 'Einstellungen',
};
