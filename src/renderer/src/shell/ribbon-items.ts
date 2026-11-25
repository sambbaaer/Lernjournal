// Inhalt des Menübands (Ribbon), getrennt von der Darstellung.
// «Vereinfachtes Menüband» wie in aktuellem Office: eine kompakte Zeile pro
// Register statt einer hohen, halb leeren Fläche (SPEC).
//
// Editor-Befehle wirken auf den zuletzt fokussierten Abschnitts-Editor.
// Steht die Einfügemarke in einer Tabelle, erscheint das kontextuelle
// Register «Tabelle» (wie «Tabellenlayout» in Word).
import type { Editor } from '@tiptap/react';
import type { LucideIcon } from 'lucide-react';
import {
  BetweenHorizontalEnd,
  BetweenHorizontalStart,
  BetweenVerticalEnd,
  BetweenVerticalStart,
  Bold,
  CircleCheck,
  ClipboardPaste,
  Columns2,
  FileDown,
  FileText,
  Files,
  PackageOpen,
  FolderTree,
  Globe,
  Heading2,
  Heading3,
  Image,
  Italic,
  Link2,
  List,
  ListOrdered,
  PanelTop,
  PanelTopOpen,
  Pilcrow,
  Redo2,
  Rows2,
  Table,
  Tags,
  Trash2,
  Underline,
  Info,
  OctagonAlert,
  Lightbulb,
  ListChecks,
  Calculator,
  Wrench,
  BookmarkPlus,
  Brackets,
  Blocks,
  Undo2,
} from 'lucide-react';
import { journalIdFromHref } from '@shared/links';
import { insertBlock, toggleCallout } from '../editor/blocks';
import { insertImages, pasteFromClipboard, pickImageFiles } from '../editor/insert-image';
import { setJournalStatus } from '../journal/actions';
import type { Action, AppState, RibbonTab } from '../state/app-state';

export type RibbonCtx = {
  state: AppState;
  dispatch: (a: Action) => void;
  editor: Editor | null;
  openLinkDialog: () => void;
  openJournalLinkDialog: () => void;
};

const calloutItem = (kind: 'merke' | 'achtung' | 'tipp', label: string, icon: LucideIcon) =>
  editorItem(`callout-${kind}`, label, icon, (e) => toggleCallout(e, kind), {
    iconOnly: false,
    pressed: (e) => e.isActive('callout', { kind }),
    can: (e) => !e.isActive('calculation'),
  });

// Steht die Einfügemarke in einem Link? Interne Journal-Links (AJ-10) und
// Weblinks werden getrennt angezeigt und bearbeitet.
export function activeLinkKind(editor: Editor | null): 'journal' | 'web' | null {
  if (!editor || editor.isDestroyed || !editor.isActive('link')) return null;
  return journalIdFromHref(editor.getAttributes('link')['href']) ? 'journal' : 'web';
}

export type RibbonItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  shortcut?: string;
  // Nur das Symbol zeigen (Text bleibt für Screenreader und Tooltip erhalten)
  iconOnly?: boolean;
  disabledReason: (c: RibbonCtx) => string | null;
  run?: (c: RibbonCtx) => void;
  // Umschaltknopf: gedrückt (aria-pressed), z. B. «Fett» an der Einfügemarke aktiv
  pressed?: (c: RibbonCtx) => boolean;
  // Zusatz im Tooltip, z. B. «auch mit [[ im Text»
  hint?: string;
};

// Aufklapp-Menü mit verwandten Befehlen (wie «Schnellbausteine» in Word).
// Spart Platz im Menüband; die Befehle selbst sind gewöhnliche RibbonItems.
export type RibbonMenu = { kind: 'menu'; id: string; label: string; icon: LucideIcon; items: RibbonItem[] };
export type RibbonEntry = RibbonItem | RibbonMenu;
export const isMenu = (e: RibbonEntry): e is RibbonMenu => 'kind' in e && e.kind === 'menu';

export type RibbonGroup = { id: string; label: string; items: RibbonEntry[] };

const NO_EDITOR = 'Zuerst in einen Abschnitt des Journals klicken';
const onlyInJournal = ({ state }: RibbonCtx) =>
  state.openJournal && state.view === 'journal' ? null : 'Nur in einem geöffneten Journal verfügbar';

// Hilfsfunktion für Editor-Befehle: verfügbar, wenn ein Journal offen und ein
// Abschnitt aktiv ist; «can» prüft zusätzlich, ob der Befehl gerade möglich ist.
function editorItem(
  id: string,
  label: string,
  icon: LucideIcon,
  action: (e: Editor) => void,
  opts: {
    shortcut?: string;
    iconOnly?: boolean;
    can?: (e: Editor) => boolean;
    pressed?: (e: Editor) => boolean;
  } = {},
): RibbonItem {
  return {
    id,
    label,
    icon,
    shortcut: opts.shortcut,
    iconOnly: opts.iconOnly ?? true,
    disabledReason: ({ state, editor }) => {
      if (state.view !== 'journal' || !editor || editor.isDestroyed) return NO_EDITOR;
      if (opts.can && !opts.can(editor)) return 'Hier gerade nicht möglich';
      return null;
    },
    run: ({ editor }) => editor && action(editor),
    pressed: opts.pressed
      ? ({ editor }) => !!editor && !editor.isDestroyed && opts.pressed!(editor)
      : undefined,
  };
}

const chain = (e: Editor) => e.chain().focus();

export function ribbonTabs(c: RibbonCtx): { id: RibbonTab; label: string; contextual?: boolean }[] {
  const tabs: { id: RibbonTab; label: string; contextual?: boolean }[] = [
    { id: 'start', label: 'Start' },
    { id: 'einfuegen', label: 'Einfügen' },
    { id: 'journal', label: 'Journal' },
    { id: 'exportieren', label: 'Exportieren' },
  ];
  if (inTable(c)) tabs.push({ id: 'tabelle', label: 'Tabelle', contextual: true });
  return tabs;
}

export function inTable(c: RibbonCtx): boolean {
  return c.state.view === 'journal' && !!c.editor && !c.editor.isDestroyed && c.editor.isActive('table');
}

export const RIBBON: Record<RibbonTab, RibbonGroup[]> = {
  start: [
    {
      id: 'zwischenablage',
      label: 'Zwischenablage',
      items: [
        {
          ...editorItem('paste', 'Einfügen', ClipboardPaste, () => {}, {
            iconOnly: false,
            shortcut: 'Ctrl+V',
          }),
          run: ({ editor, dispatch }) => pasteFromClipboard(editor, dispatch),
        },
        {
          ...editorItem('paste-plain', 'Nur Text', FileText, () => {}, {
            shortcut: 'Ctrl+Shift+V',
          }),
          run: ({ editor, dispatch }) => pasteFromClipboard(editor, dispatch, { plainText: true }),
        },
      ],
    },
    {
      id: 'verlauf',
      label: 'Rückgängig',
      items: [
        editorItem('undo', 'Rückgängig', Undo2, (e) => chain(e).undo().run(), {
          shortcut: 'Ctrl+Z',
          can: (e) => e.can().undo(),
        }),
        editorItem('redo', 'Wiederholen', Redo2, (e) => chain(e).redo().run(), {
          shortcut: 'Ctrl+Y',
          can: (e) => e.can().redo(),
        }),
      ],
    },
    {
      id: 'schrift',
      label: 'Schrift',
      items: [
        editorItem('bold', 'Fett', Bold, (e) => chain(e).toggleBold().run(), {
          shortcut: 'Ctrl+B',
          pressed: (e) => e.isActive('bold'),
        }),
        editorItem('italic', 'Kursiv', Italic, (e) => chain(e).toggleItalic().run(), {
          shortcut: 'Ctrl+I',
          pressed: (e) => e.isActive('italic'),
        }),
        editorItem('underline', 'Unterstrichen', Underline, (e) => chain(e).toggleUnderline().run(), {
          shortcut: 'Ctrl+U',
          pressed: (e) => e.isActive('underline'),
        }),
      ],
    },
    {
      id: 'absatz',
      label: 'Absatz',
      items: [
        editorItem('bullets', 'Aufzählung', List, (e) => chain(e).toggleBulletList().run(), {
          pressed: (e) => e.isActive('bulletList'),
        }),
        editorItem('numbers', 'Nummerierung', ListOrdered, (e) => chain(e).toggleOrderedList().run(), {
          pressed: (e) => e.isActive('orderedList'),
        }),
        editorItem('tasks', 'Checkliste', ListChecks, (e) => chain(e).toggleTaskList().run(), {
          pressed: (e) => e.isActive('taskList'),
          can: (e) => e.can().toggleTaskList(),
        }),
      ],
    },
    {
      id: 'formatvorlagen',
      label: 'Formatvorlagen',
      items: [
        editorItem('normal', 'Standard', Pilcrow, (e) => chain(e).setParagraph().run(), {
          iconOnly: false,
          pressed: (e) => e.isActive('paragraph'),
        }),
        editorItem('h2', 'Überschrift 2', Heading2, (e) => chain(e).toggleHeading({ level: 2 }).run(), {
          iconOnly: false,
          pressed: (e) => e.isActive('heading', { level: 2 }),
        }),
        editorItem('h3', 'Überschrift 3', Heading3, (e) => chain(e).toggleHeading({ level: 3 }).run(), {
          iconOnly: false,
          pressed: (e) => e.isActive('heading', { level: 3 }),
        }),
      ],
    },
  ],
  einfuegen: [
    {
      id: 'struktur',
      label: 'Struktur',
      items: [
        {
          id: 'section',
          label: 'Abschnitt hinzufügen',
          icon: PanelTopOpen,
          iconOnly: false,
          disabledReason: onlyInJournal,
          run: ({ dispatch }) => dispatch({ type: 'openJournalSectionForm' }),
        },
      ],
    },
    {
      id: 'medien',
      label: 'Medien',
      items: [
        {
          ...editorItem('image', 'Bild', Image, () => {}, { iconOnly: false }),
          // Öffnet den Windows-Dateidialog; auch Drag & Drop und Strg+V funktionieren
          run: ({ editor, state, dispatch }) => {
            const journalId = state.openJournal?.id;
            if (!editor || !journalId) return;
            void pickImageFiles().then((files) => insertImages(editor, files, journalId, dispatch));
          },
        },
      ],
    },
    {
      id: 'tabellen',
      label: 'Tabellen',
      items: [
        editorItem(
          'table',
          'Tabelle',
          Table,
          (e) => chain(e).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
          { iconOnly: false, can: (e) => e.can().insertTable({ rows: 3, cols: 3, withHeaderRow: true }) },
        ),
      ],
    },
    {
      // Fachspezifische Bausteine (AJ-28–AJ-31) in EINEM Aufklapp-Menü wie
      // «Schnellbausteine» in Word – sonst bräuchte das Menüband zwei Zeilen
      id: 'bausteine',
      label: 'Bausteine',
      items: [
        {
          kind: 'menu',
          id: 'blocks',
          label: 'Bausteine',
          icon: Blocks,
          items: [
            calloutItem('merke', 'Merke', Info),
            calloutItem('achtung', 'Achtung', OctagonAlert),
            calloutItem('tipp', 'Tipp', Lightbulb),
            editorItem('checklist', 'Checkliste', ListChecks, (e) => insertBlock(e, 'checklist'), {
              iconOnly: false,
              pressed: (e) => e.isActive('taskList'),
            }),
            editorItem('calculation', 'Rechenblock', Calculator, (e) => insertBlock(e, 'calculation'), {
              iconOnly: false,
              can: (e) => !e.isActive('table') && !e.isActive('calculation'),
            }),
            // Störungstabelle (AJ-30): Symptom → Ursache → Massnahme
            editorItem(
              'troubleshooting',
              'Störungstabelle',
              Wrench,
              (e) => insertBlock(e, 'troubleshooting'),
              {
                iconOnly: false,
                can: (e) => !e.isActive('table'),
              },
            ),
          ],
        },
      ],
    },
    {
      id: 'links',
      label: 'Verknüpfungen',
      items: [
        {
          // Wort im Text verweist auf ein anderes Journal (AJ-10); Strg+Klick öffnet es
          ...editorItem('journal-link', 'Link zu Journal', Link2, () => {}, {
            iconOnly: false,
            pressed: (e) => activeLinkKind(e) === 'journal',
          }),
          run: (c) => c.openJournalLinkDialog(),
        },
        {
          ...editorItem('web-link', 'Weblink', Globe, () => {}, {
            iconOnly: false,
            pressed: (e) => activeLinkKind(e) === 'web',
          }),
          run: (c) => c.openLinkDialog(),
        },
        {
          // Querverweis «[[…]]» auf Journal oder Schlagwort (AJ-27)
          ...editorItem('cross-ref', 'Querverweis', Brackets, () => {}, { iconOnly: false }),
          hint: 'auch mit [[ im Text',
          run: ({ dispatch }) => dispatch({ type: 'openCrossRef', source: 'ribbon' }),
        },
      ],
    },
    {
      // Merkstelle (AJ-33): markierter Text erscheint mit Fachbegriff im Fachbuch
      id: 'fachbuch',
      label: 'Fachbuch',
      items: [
        {
          ...editorItem('merkstelle', 'Merkstelle', BookmarkPlus, () => {}, {
            iconOnly: false,
            pressed: (e) => e.isActive('merkstelle'),
          }),
          run: ({ dispatch }) => dispatch({ type: 'openMerkstelleDialog' }),
        },
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
          iconOnly: false,
          disabledReason: onlyInJournal,
          pressed: ({ state }) => state.openJournal?.status === 'completed',
          run: ({ state, dispatch }) => {
            const j = state.openJournal;
            if (j) void setJournalStatus(dispatch, j.id, j.status === 'completed' ? 'draft' : 'completed');
          },
        },
      ],
    },
    {
      id: 'ordnen',
      label: 'Ordnen',
      items: [
        {
          id: 'categories',
          label: 'Kategorien',
          icon: FolderTree,
          iconOnly: false,
          disabledReason: onlyInJournal,
          // Springt zur Kategorienauswahl im Journal (öffnet die Liste)
          run: ({ dispatch }) => dispatch({ type: 'requestFocus', target: 'journal-categories' }),
        },
        {
          id: 'tags',
          label: 'Schlagwörter',
          icon: Tags,
          iconOnly: false,
          disabledReason: onlyInJournal,
          run: ({ dispatch }) => dispatch({ type: 'requestFocus', target: 'journal-tags' }),
        },
        {
          // Verwandtes Journal verknüpfen (AJ-10): öffnet die Auswahl mit Suche
          id: 'links',
          label: 'Verknüpfen',
          icon: Link2,
          iconOnly: false,
          disabledReason: onlyInJournal,
          run: ({ dispatch }) => dispatch({ type: 'requestFocus', target: 'journal-links' }),
        },
      ],
    },
  ],
  exportieren: [
    {
      id: 'word',
      label: 'Dokumente',
      items: [
        {
          id: 'pdf-single',
          label: 'Dieses Journal als PDF',
          icon: FileDown,
          iconOnly: false,
          disabledReason: onlyInJournal,
          run: ({ state, dispatch }) => {
            if (state.openJournal)
              dispatch({ type: 'openExport', format: 'pdf', journalIds: [state.openJournal.id] });
          },
        },
        {
          // Einzel-DOCX (AJ-12): öffnet den Exportdialog mit Hinweis (R-10)
          id: 'export-single',
          label: 'Dieses Journal als Word',
          icon: FileDown,
          iconOnly: false,
          disabledReason: onlyInJournal,
          run: ({ state, dispatch }) => {
            if (state.openJournal) dispatch({ type: 'openExport', journalIds: [state.openJournal.id] });
          },
        },
        {
          // Sammel-DOCX (AJ-13): Auswahl und Reihenfolge in der Ansicht «Export»
          id: 'export-collection',
          label: 'Mehrere Journale exportieren',
          icon: Files,
          iconOnly: false,
          disabledReason: () => null,
          run: ({ dispatch }) => dispatch({ type: 'navigate', view: 'export' }),
        },
      ],
    },
    {
      id: 'projekt',
      label: 'Projekt',
      items: [
        {
          // Ganzes Projekt als .ajournal (AJ-14), z. B. für einen neuen Computer
          id: 'export-archive',
          label: 'Projekt übergeben (.ajournal)',
          icon: PackageOpen,
          iconOnly: false,
          disabledReason: () => null,
          run: ({ dispatch }) => dispatch({ type: 'openArchive', mode: 'export' }),
        },
      ],
    },
  ],
  tabelle: [
    {
      id: 'zeilen',
      label: 'Zeilen',
      items: [
        editorItem(
          'row-before',
          'Zeile oberhalb einfügen',
          BetweenHorizontalStart,
          (e) => chain(e).addRowBefore().run(),
          {
            can: (e) => e.can().addRowBefore(),
          },
        ),
        editorItem(
          'row-after',
          'Zeile unterhalb einfügen',
          BetweenHorizontalEnd,
          (e) => chain(e).addRowAfter().run(),
          {
            can: (e) => e.can().addRowAfter(),
          },
        ),
        editorItem('row-delete', 'Zeile löschen', Rows2, (e) => chain(e).deleteRow().run(), {
          can: (e) => e.can().deleteRow(),
        }),
      ],
    },
    {
      id: 'spalten',
      label: 'Spalten',
      items: [
        editorItem(
          'col-before',
          'Spalte links einfügen',
          BetweenVerticalStart,
          (e) => chain(e).addColumnBefore().run(),
          {
            can: (e) => e.can().addColumnBefore(),
          },
        ),
        editorItem(
          'col-after',
          'Spalte rechts einfügen',
          BetweenVerticalEnd,
          (e) => chain(e).addColumnAfter().run(),
          {
            can: (e) => e.can().addColumnAfter(),
          },
        ),
        editorItem('col-delete', 'Spalte löschen', Columns2, (e) => chain(e).deleteColumn().run(), {
          can: (e) => e.can().deleteColumn(),
        }),
      ],
    },
    {
      id: 'tabelle',
      label: 'Tabelle',
      items: [
        editorItem('header-row', 'Kopfzeile', PanelTop, (e) => chain(e).toggleHeaderRow().run(), {
          iconOnly: false,
          can: (e) => e.can().toggleHeaderRow(),
        }),
        editorItem('table-delete', 'Tabelle löschen', Trash2, (e) => chain(e).deleteTable().run(), {
          iconOnly: false,
          can: (e) => e.can().deleteTable(),
        }),
      ],
    },
  ],
};
