// Inhalt des Menübands (Ribbon), getrennt von der Darstellung.
// «Vereinfachtes Menüband» wie in aktuellem Office: eine kompakte Zeile pro
// Register statt einer hohen, halb leeren Fläche (SPEC).
//
// Editor-Befehle (Fett, Bild einfügen …) sind bis AJ-06 nicht verfügbar und
// zeigen den Grund im Tooltip. Sie stehen trotzdem schon da, damit Layout,
// Tastaturbedienung und Barrierefreiheit jetzt geprüft werden können.
import type { LucideIcon } from 'lucide-react';
import {
  Bold,
  CircleCheck,
  ClipboardPaste,
  Copy,
  FileDown,
  Files,
  FolderTree,
  Globe,
  Heading2,
  Heading3,
  Image,
  Italic,
  Link2,
  List,
  ListOrdered,
  MapPin,
  Pilcrow,
  Redo2,
  Scissors,
  Table,
  Tags,
  Underline,
  Undo2,
} from 'lucide-react';
import { setJournalStatus } from '../journal/actions';
import type { Action, AppState, RibbonTab } from '../state/app-state';

export type RibbonItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  shortcut?: string;
  // Nur das Symbol zeigen (Text bleibt für Screenreader und Tooltip erhalten)
  iconOnly?: boolean;
  disabledReason: (s: AppState) => string | null;
  run?: (s: AppState, dispatch: (a: Action) => void) => void;
};
export type RibbonGroup = { id: string; label: string; items: RibbonItem[] };

const NO_JOURNAL = () => 'Nur in einem geöffneten Journal verfügbar';
const editor = (
  id: string,
  label: string,
  icon: LucideIcon,
  shortcut?: string,
  iconOnly = true,
): RibbonItem => ({
  id,
  label,
  icon,
  shortcut,
  iconOnly,
  disabledReason: NO_JOURNAL,
});

export const RIBBON_TABS: { id: RibbonTab; label: string }[] = [
  { id: 'start', label: 'Start' },
  { id: 'einfuegen', label: 'Einfügen' },
  { id: 'journal', label: 'Journal' },
  { id: 'exportieren', label: 'Exportieren' },
];

export const RIBBON: Record<RibbonTab, RibbonGroup[]> = {
  start: [
    {
      id: 'verlauf',
      label: 'Rückgängig',
      items: [editor('undo', 'Rückgängig', Undo2, 'Ctrl+Z'), editor('redo', 'Wiederholen', Redo2, 'Ctrl+Y')],
    },
    {
      id: 'zwischenablage',
      label: 'Zwischenablage',
      items: [
        editor('paste', 'Einfügen', ClipboardPaste, 'Ctrl+V'),
        editor('cut', 'Ausschneiden', Scissors, 'Ctrl+X'),
        editor('copy', 'Kopieren', Copy, 'Ctrl+C'),
      ],
    },
    {
      id: 'schrift',
      label: 'Schrift',
      items: [
        editor('bold', 'Fett', Bold, 'Ctrl+B'),
        editor('italic', 'Kursiv', Italic, 'Ctrl+I'),
        editor('underline', 'Unterstrichen', Underline, 'Ctrl+U'),
      ],
    },
    {
      id: 'absatz',
      label: 'Absatz',
      items: [editor('bullets', 'Aufzählung', List), editor('numbers', 'Nummerierung', ListOrdered)],
    },
    {
      id: 'formatvorlagen',
      label: 'Formatvorlagen',
      items: [
        editor('normal', 'Standard', Pilcrow, undefined, false),
        editor('h2', 'Überschrift 2', Heading2, undefined, false),
        editor('h3', 'Überschrift 3', Heading3, undefined, false),
      ],
    },
  ],
  einfuegen: [
    {
      id: 'medien',
      label: 'Medien',
      items: [
        editor('image', 'Bild', Image, undefined, false),
        editor('table', 'Tabelle', Table, undefined, false),
      ],
    },
    {
      id: 'links',
      label: 'Verknüpfungen',
      items: [
        editor('journal-link', 'Link zu Journal', Link2, undefined, false),
        editor('web-link', 'Weblink', Globe, undefined, false),
      ],
    },
  ],
  journal: [
    {
      id: 'eigenschaften',
      label: 'Eigenschaften',
      items: [
        {
          id: 'status',
          label: 'Abgeschlossen',
          icon: CircleCheck,
          disabledReason: (s) =>
            s.openJournal && s.view === 'journal' ? null : 'Nur in einem geöffneten Journal verfügbar',
          run: (s, d) => {
            const j = s.openJournal;
            if (j) void setJournalStatus(d, j.id, j.status === 'completed' ? 'draft' : 'completed');
          },
        },
        editor('lernort', 'Lernort', MapPin, undefined, false),
      ],
    },
    {
      id: 'ordnen',
      label: 'Ordnen',
      items: [
        editor('categories', 'Kategorien', FolderTree, undefined, false),
        editor('tags', 'Schlagwörter', Tags, undefined, false),
      ],
    },
  ],
  exportieren: [
    {
      id: 'word',
      label: 'Word',
      items: [
        editor('export-single', 'Dieses Journal als Word', FileDown, undefined, false),
        {
          id: 'export-collection',
          label: 'Mehrere Journale als Word',
          icon: Files,
          disabledReason: () => null,
          run: (_s, d) => d({ type: 'navigate', view: 'export' }),
        },
      ],
    },
  ],
};
