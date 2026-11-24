// Zentraler Zustand der Oberfläche (ohne Journal-Daten – die kommen über IPC).
// Ein Reducer statt vieler einzelner useState: alle Zustandswechsel stehen
// an einer Stelle und lassen sich ohne Oberfläche testen.

// 'journal' = ein einzelnes Journal ist geöffnet (Dokumentansicht)
export type View = 'start' | 'journale' | 'journal' | 'fachbuch' | 'export' | 'einstellungen';
export type RibbonTab = 'start' | 'einfuegen' | 'journal' | 'exportieren' | 'tabelle';
export type BackstagePage = 'neu' | 'oeffnen' | 'importieren' | 'exportieren' | 'einstellungen' | 'info';

import type { ProjectInfo } from '@shared/ipc';
import { DEFAULT_QV_MINIMUM, type ExportFormat } from '@shared/export';
import type { JournalDetail, JournalSummary } from '@shared/journal';
import { EMPTY_LINKS, type JournalLinks } from '@shared/links';
import { MCP_OFF, type McpStatus } from '@shared/mcp';
import { EMPTY_TAXONOMY, type Taxonomy } from '@shared/taxonomy';
import { INITIAL_FACHBUCH, type FachbuchState } from '../fachbuch/fachbuch-logic';

export type RecentProject = { path: string; title: string; lastOpened: string };

// Speicherstatus: nur Zustände, die auch WIRKLICH zutreffen dürfen (SPEC).
// 'idle' = noch kein Journal gespeichert oder aus der Datenbank geladen.
export type SaveStatus =
  | { kind: 'idle' | 'pending' | 'saving' }
  | { kind: 'saved'; at: number }
  | { kind: 'error'; message: string };

const NO_DETAIL_WRITES = { active: 0, error: null };

export type AppState = {
  settingsTab: SettingsTab;
  mcp: McpStatus;
  appearance: Appearance;
  qvMinimum: number;
  view: View;
  ribbonTab: RibbonTab;
  backstage: BackstagePage | null; // null = Datei-Menü geschlossen
  saveStatus: SaveStatus;
  journalDetailSave: { active: number; error: string | null };
  // Kurze Meldung in der Statusleiste (z. B. «Folgt in einem späteren Schritt»)
  notice: string | null;
  // Fokuswunsch, den eine Ansicht nach dem Rendern erfüllt (z. B. Suchfeld)
  // 'journal-categories'/'journal-tags': Menüband «Journal → Ordnen» springt
  // zu den Feldern im geöffneten Journal; 'journal-links' öffnet «Journal verknüpfen» (AJ-10);
  // 'settings-backups' springt in den Einstellungen zu «Sicherungen» (AJ-15)
  focusRequest:
    | 'fachbuch-search'
    | 'journal-categories'
    | 'journal-tags'
    | 'journal-links'
    | 'settings-backups'
    | 'settings-mcp'
    | null;
  // Projekt: null = keines geöffnet → Startbildschirm/Assistent
  project: ProjectInfo | null;
  // Zählt jedes Öffnen eines Projekts. Die Oberfläche lädt Journale neu, wenn
  // er sich ändert – auch wenn dasselbe Projekt (gleiche ID, gleicher Ordner)
  // neu geöffnet wurde, z. B. nach dem Ersetzen durch eine Sicherung (AJ-15).
  projectEpoch: number;
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
  journalTemplatesOpen: boolean;
  journalDetailsOpen: boolean;
  journalSectionForm: { sectionId?: string } | null;
  // Neues Journal wird angelegt (Strg+N, AJ-17): Solange der Hauptprozess
  // antwortet, zeigt die Dokumentfläche statt des bisherigen Journals einen
  // Platzhalter mit eigenem Titelfeld. Ohne ihn landete, wer direkt nach
  // Strg+N lostippte, im noch angezeigten VORHERIGEN Journal (Titel oder
  // Text überschrieben). `title` = bisher im Platzhalter getippt.
  creatingJournal: { title: string } | null;
  // Im Platzhalter getippter Titel, den das eben angelegte Journal beim
  // ersten Anzeigen übernimmt (und speichert). Danach wieder null.
  newJournalTitle: { journalId: string; title: string } | null;
  // Verknüpfungen und Rückverweise des geöffneten Journals (AJ-10)
  openJournalLinks: JournalLinks;
  // Kategorien und Schlagwörter des Projekts (AJ-09)
  taxonomy: Taxonomy;
  // Fachbuch (AJ-11): Suchbegriff, gewähltes Thema, Archiv ein/aus. Im
  // zentralen Zustand, damit die Suche erhalten bleibt, wenn man ein Journal
  // aus den Treffern öffnet und wieder zum Fachbuch zurückkehrt.
  fachbuch: FachbuchState;
  // Word-Export: offener Exportdialog mit den gewählten Journalen. Ohne
  // `collection` ein Einzel-DOCX (AJ-12, genau ein Journal), mit `collection`
  // ein Sammel-DOCX (AJ-13) in der Reihenfolge der Liste.
  exportDialog: ExportDialogState | null;
  // Zusammenstellung für das Sammel-DOCX (AJ-13): gewählte Journale in der
  // Reihenfolge im Dokument und Titel der Titelseite. Im zentralen Zustand,
  // damit die Auswahl erhalten bleibt, wenn man zwischendurch ein Journal
  // öffnet und zur Ansicht «Export» zurückkehrt.
  collection: CollectionState;
  // Projektübergabe .ajournal (AJ-14): offener Dialog «Projekt übergeben»
  // bzw. «Projekt importieren». Bleibt beim Projektwechsel bestehen – der
  // Import öffnet das neue Projekt und zeigt danach im selben Dialog das Ergebnis.
  archiveDialog: ArchiveDialogMode | null;
  // Wiederherstellung einer Sicherung (AJ-15): offener Dialog mit der ID aus
  // der Liste. Wie archiveDialog im zentralen Zustand, weil das Ersetzen das
  // Projekt neu öffnet und der Dialog danach das Ergebnis zeigt.
  restoreDialog: { backupId: string } | null;
};

export type ArchiveDialogMode = 'export' | 'import';

export type Appearance = 'light' | 'dark' | 'system';
export type SettingsTab = 'general' | 'mcp';
export type ExportDialogState = {
  journalIds: string[];
  format?: ExportFormat;
  collection?: { title: string };
};
export type CollectionState = { ids: string[]; title: string };
export const INITIAL_COLLECTION: CollectionState = { ids: [], title: '' };

export const initialState: AppState = {
  settingsTab: 'general',
  mcp: MCP_OFF,
  appearance: 'light',
  qvMinimum: DEFAULT_QV_MINIMUM,
  view: 'start',
  ribbonTab: 'start',
  backstage: null,
  saveStatus: { kind: 'idle' },
  journalDetailSave: NO_DETAIL_WRITES,
  notice: null,
  focusRequest: null,
  project: null,
  projectEpoch: 0,
  projectLoaded: false,
  recent: [],
  suggestedLocation: '',
  wizardOpen: false,
  syncWarningDismissed: false,
  journals: [],
  journalsLoaded: false,
  openJournal: null,
  journalTemplatesOpen: false,
  journalDetailsOpen: false,
  journalSectionForm: null,
  creatingJournal: null,
  newJournalTitle: null,
  openJournalLinks: EMPTY_LINKS,
  taxonomy: EMPTY_TAXONOMY,
  fachbuch: INITIAL_FACHBUCH,
  exportDialog: null,
  collection: INITIAL_COLLECTION,
  archiveDialog: null,
  restoreDialog: null,
};

export type Action =
  | { type: 'setAppearance'; appearance: Appearance }
  | { type: 'setQvMinimum'; minimum: number }
  | { type: 'navigate'; view: View }
  | { type: 'showBackups' }
  | { type: 'showMcp' }
  | { type: 'selectSettingsTab'; tab: SettingsTab }
  | { type: 'mcpStatus'; status: McpStatus }
  | { type: 'mcpJournalApplied'; journal: JournalDetail }
  | { type: 'selectRibbonTab'; tab: RibbonTab }
  | { type: 'openBackstage'; page?: BackstagePage }
  | { type: 'closeBackstage' }
  | { type: 'setSaveStatus'; journalId: string; status: SaveStatus }
  | { type: 'journalDetailWriteStarted'; journalId: string }
  | { type: 'journalDetailWriteFinished'; journalId: string; error?: string }
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
  | { type: 'openJournalTemplates' }
  | { type: 'closeJournalTemplates' }
  | { type: 'toggleJournalDetails' }
  | { type: 'openJournalSectionForm'; sectionId?: string }
  | { type: 'closeJournalSectionForm' }
  // Strg+N (AJ-17): Anlegen gestartet / Titel im Platzhalter / angelegt /
  // fehlgeschlagen / Titel vom neuen Journal übernommen
  | { type: 'journalCreating' }
  | { type: 'journalCreatingTitle'; title: string }
  | { type: 'journalCreated'; journal: JournalDetail }
  | { type: 'journalCreateFailed' }
  | { type: 'newJournalTitleTaken' }
  | { type: 'journalClosed' }
  | { type: 'taxonomyLoaded'; taxonomy: Taxonomy }
  | { type: 'linksLoaded'; journalId: string; links: JournalLinks }
  | { type: 'fachbuchChanged'; change: Partial<FachbuchState> }
  | ({ type: 'openExport' } & ExportDialogState)
  | { type: 'closeExport' }
  | { type: 'collectionChanged'; change: Partial<CollectionState> }
  | { type: 'openArchive'; mode: ArchiveDialogMode }
  | { type: 'closeArchive' }
  | { type: 'openRestore'; backupId: string }
  | { type: 'closeRestore' }
  // Projektübergabe gespeichert bzw. Erinnerung ausgeblendet (AJ-15)
  | { type: 'exportRecorded'; lastExportAt: string }
  | { type: 'exportReminderSnoozed'; until: string };

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'setAppearance':
      return { ...state, appearance: action.appearance };
    case 'setQvMinimum':
      return { ...state, qvMinimum: action.minimum };
    case 'navigate':
      // Navigieren schliesst das Datei-Menü, wie in Office. Wer während des
      // Anlegens wegnavigiert, will das neue Journal nicht mehr öffnen.
      return {
        ...state,
        view: action.view,
        backstage: null,
        notice: null,
        creatingJournal: null,
        journalSectionForm: null,
      };
    case 'showBackups':
      return {
        ...reducer(state, { type: 'navigate', view: 'einstellungen' }),
        settingsTab: 'general',
        focusRequest: 'settings-backups',
      };
    case 'showMcp':
      return {
        ...reducer(state, { type: 'navigate', view: 'einstellungen' }),
        settingsTab: 'mcp',
        focusRequest: 'settings-mcp',
      };
    case 'selectSettingsTab':
      return { ...state, settingsTab: action.tab };
    case 'mcpStatus':
      return { ...state, mcp: action.status };
    case 'mcpJournalApplied': {
      const { sections, createdAt, ...summary } = action.journal;
      const updated = reducer(state, { type: 'journalUpserted', journal: summary });
      return updated.openJournal?.id === summary.id
        ? {
            ...updated,
            openJournal: { ...summary, sections, createdAt },
            saveStatus: { kind: 'saved', at: Date.parse(summary.updatedAt) },
          }
        : updated;
    }
    case 'selectRibbonTab':
      return { ...state, ribbonTab: action.tab };
    case 'openBackstage':
      return { ...state, backstage: action.page ?? 'neu' };
    case 'closeBackstage':
      return { ...state, backstage: null };
    case 'setSaveStatus':
      return state.openJournal?.id === action.journalId ? { ...state, saveStatus: action.status } : state;
    case 'journalDetailWriteStarted':
      if (state.openJournal?.id !== action.journalId) return state;
      return { ...state, journalDetailSave: { active: state.journalDetailSave.active + 1, error: null } };
    case 'journalDetailWriteFinished':
      if (state.openJournal?.id !== action.journalId || !state.journalDetailSave.active) return state;
      return {
        ...state,
        journalDetailSave: {
          active: state.journalDetailSave.active - 1,
          error: action.error ?? state.journalDetailSave.error,
        },
      };
    case 'notice':
      return { ...state, notice: action.text };
    case 'requestFocus':
      return {
        ...state,
        focusRequest: action.target,
        journalDetailsOpen: state.journalDetailsOpen || !!action.target?.startsWith('journal-'),
      };
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
        projectEpoch: state.projectEpoch + 1,
        recent,
        wizardOpen: false,
        backstage: null,
        view: 'start',
        saveStatus: { kind: 'idle' },
        journalDetailSave: NO_DETAIL_WRITES,
        syncWarningDismissed: false,
        journals: [],
        journalsLoaded: false,
        openJournal: null,
        journalTemplatesOpen: false,
        journalDetailsOpen: false,
        journalSectionForm: null,
        creatingJournal: null,
        newJournalTitle: null,
        openJournalLinks: EMPTY_LINKS,
        taxonomy: EMPTY_TAXONOMY,
        fachbuch: INITIAL_FACHBUCH,
        exportDialog: null,
        collection: INITIAL_COLLECTION,
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
        saveStatus: { kind: 'idle' },
        journalDetailSave: NO_DETAIL_WRITES,
        notice: null,
        journals: [],
        journalsLoaded: false,
        openJournal: null,
        journalTemplatesOpen: false,
        journalDetailsOpen: false,
        journalSectionForm: null,
        creatingJournal: null,
        newJournalTitle: null,
        openJournalLinks: EMPTY_LINKS,
        taxonomy: EMPTY_TAXONOMY,
        fachbuch: INITIAL_FACHBUCH,
        exportDialog: null,
        collection: INITIAL_COLLECTION,
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
    case 'journalRemoved': {
      // Rückverweise auf das gelöschte Journal aus der Anzeige entfernen
      // (der Hauptprozess hat Verknüpfungen und Text-Links bereits gelöscht)
      const drop = (l: JournalLinks['linked']) => l.filter((x) => x.id !== action.id);
      return {
        ...state,
        openJournalLinks: {
          linked: drop(state.openJournalLinks.linked),
          mentionedIn: drop(state.openJournalLinks.mentionedIn),
        },
        journals: state.journals.filter((x) => x.id !== action.id),
        // Gelöschtes Journal auch aus der Zusammenstellung für das Sammel-DOCX
        collection: state.collection.ids.includes(action.id)
          ? { ...state.collection, ids: state.collection.ids.filter((x) => x !== action.id) }
          : state.collection,
        openJournal: state.openJournal?.id === action.id ? null : state.openJournal,
        saveStatus: state.openJournal?.id === action.id ? { kind: 'idle' } : state.saveStatus,
        journalDetailSave: state.openJournal?.id === action.id ? NO_DETAIL_WRITES : state.journalDetailSave,
        view: state.openJournal?.id === action.id ? 'journale' : state.view,
      };
    }
    case 'openJournalTemplates':
      return state.project && !state.creatingJournal ? { ...state, journalTemplatesOpen: true } : state;
    case 'closeJournalTemplates':
      return { ...state, journalTemplatesOpen: false };
    case 'toggleJournalDetails':
      return { ...state, journalDetailsOpen: !state.journalDetailsOpen };
    case 'openJournalSectionForm':
      return { ...state, journalSectionForm: { sectionId: action.sectionId } };
    case 'closeJournalSectionForm':
      return { ...state, journalSectionForm: null };
    case 'journalCreating':
      // Bisheriges Journal sofort ausblenden (es speichert beim Ausblenden
      // Ausstehendes), Platzhalter mit leerem Titelfeld zeigen
      return {
        ...state,
        creatingJournal: { title: '' },
        journalTemplatesOpen: false,
        journalDetailsOpen: false,
        journalSectionForm: null,
        newJournalTitle: null,
        openJournal: null,
        openJournalLinks: EMPTY_LINKS,
        view: 'journal',
        backstage: null,
        notice: null,
        saveStatus: { kind: 'idle' },
        journalDetailSave: NO_DETAIL_WRITES,
      };
    case 'journalCreatingTitle':
      if (state.creatingJournal) return { ...state, creatingJournal: { title: action.title } };
      // Taste kam an, nachdem das Journal angelegt, aber bevor es angezeigt
      // wurde: in den zu übernehmenden Titel, damit nichts verloren geht
      if (state.newJournalTitle)
        return { ...state, newJournalTitle: { ...state.newJournalTitle, title: action.title } };
      return state;
    case 'journalCreated': {
      const withList = reducer(state, { type: 'journalUpserted', journal: action.journal });
      // Inzwischen wegnavigiert oder Projekt gewechselt: nur in die Liste
      if (!state.creatingJournal) return withList;
      return {
        ...reducer(withList, { type: 'journalOpened', journal: action.journal }),
        ...(state.creatingJournal.title ? { saveStatus: { kind: 'pending' as const } } : {}),
        newJournalTitle: { journalId: action.journal.id, title: state.creatingJournal.title },
      };
    }
    case 'journalCreateFailed':
      return state.creatingJournal
        ? { ...state, creatingJournal: null, view: state.view === 'journal' ? 'journale' : state.view }
        : state;
    case 'newJournalTitleTaken':
      return { ...state, newJournalTitle: null };
    case 'journalOpened':
      return {
        ...state,
        creatingJournal: null,
        openJournal: action.journal,
        journalDetailsOpen: state.openJournal?.id === action.journal.id && state.journalDetailsOpen,
        journalSectionForm: null,
        // Gleiches Journal erneut geöffnet: bisherige Anzeige behalten, bis neu geladen
        openJournalLinks: state.openJournal?.id === action.journal.id ? state.openJournalLinks : EMPTY_LINKS,
        view: 'journal',
        backstage: null,
        saveStatus: { kind: 'saved', at: Date.parse(action.journal.updatedAt) },
        journalDetailSave: NO_DETAIL_WRITES,
      };
    case 'journalClosed':
      return {
        ...state,
        openJournal: null,
        openJournalLinks: EMPTY_LINKS,
        saveStatus: { kind: 'idle' },
        journalDetailSave: NO_DETAIL_WRITES,
      };
    case 'taxonomyLoaded':
      return { ...state, taxonomy: action.taxonomy };
    case 'linksLoaded':
      // Antwort für ein inzwischen geschlossenes Journal verwerfen (Wettlauf beim schnellen Wechseln)
      return state.openJournal?.id === action.journalId
        ? { ...state, openJournalLinks: action.links }
        : state;
    case 'fachbuchChanged':
      return { ...state, fachbuch: { ...state.fachbuch, ...action.change } };
    case 'openExport':
      // Ohne Journal kein Dialog; das Datei-Menü schliesst (wie beim Navigieren)
      return action.journalIds.length
        ? {
            ...state,
            exportDialog: {
              journalIds: action.journalIds,
              ...(action.format && { format: action.format }),
              ...(action.collection && { collection: action.collection }),
            },
            backstage: null,
          }
        : state;
    case 'closeExport':
      return { ...state, exportDialog: null };
    case 'collectionChanged':
      return { ...state, collection: { ...state.collection, ...action.change } };
    case 'openArchive':
      // Das Datei-Menü schliesst; ein offener Word-Exportdialog ebenso (nur ein Dialog zugleich)
      return { ...state, archiveDialog: action.mode, backstage: null, exportDialog: null };
    case 'closeArchive':
      return { ...state, archiveDialog: null };
    case 'openRestore':
      // Wie bei der Übergabe: nur ein Dialog zugleich, Datei-Menü schliesst
      return {
        ...state,
        restoreDialog: { backupId: action.backupId },
        backstage: null,
        exportDialog: null,
        archiveDialog: null,
      };
    case 'closeRestore':
      return { ...state, restoreDialog: null };
    case 'exportRecorded':
      return state.project
        ? {
            ...state,
            project: { ...state.project, lastExportAt: action.lastExportAt, exportReminderUntil: null },
          }
        : state;
    case 'exportReminderSnoozed':
      return state.project
        ? { ...state, project: { ...state.project, exportReminderUntil: action.until } }
        : state;
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
