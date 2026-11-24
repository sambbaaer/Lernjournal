// Befehlsliste: Jeder Befehl hat genau EINE Definition mit Text, Tastenkürzel
// und Verfügbarkeit. Menüband, Datei-Menü und Tastatur benutzen dieselben
// Befehle – dadurch stimmen Tooltips, Kürzel und Verhalten immer überein.
import { saveNow } from '../editor/save-registry';
import { createJournal } from '../journal/actions';
import type { Action, AppState } from './app-state';

export type CommandId =
  | 'file.open'
  | 'journal.new'
  | 'journal.save'
  | 'journal.find'
  | 'fachbuch.search'
  | 'region.next'
  | 'region.previous';

export type Command = {
  id: CommandId;
  label: string;
  shortcut?: string;
  // Warum nicht verfügbar? null = verfügbar. Wird als Tooltip angezeigt.
  disabledReason: (s: AppState) => string | null;
  run: (s: AppState, dispatch: (a: Action) => void) => void;
};

const NO_JOURNAL = 'Nur in einem geöffneten Journal verfügbar';

export const commands: Record<CommandId, Command> = {
  'file.open': {
    id: 'file.open',
    label: 'Datei',
    shortcut: 'Alt+D',
    disabledReason: () => null,
    run: (s, d) => d(s.backstage ? { type: 'closeBackstage' } : { type: 'openBackstage' }),
  },
  'journal.new': {
    id: 'journal.new',
    label: 'Neues Journal',
    shortcut: 'Ctrl+N',
    disabledReason: (s) => (s.project ? null : 'Zuerst ein Lernjournal-Projekt öffnen'),
    // Läuft das Anlegen noch, nicht ein zweites Journal anlegen (Taste doppelt gedrückt)
    run: (s, d) => {
      if (!s.creatingJournal) void createJournal(d);
    },
  },
  'journal.save': {
    id: 'journal.save',
    label: 'Speichern',
    shortcut: 'Ctrl+S',
    disabledReason: () => null,
    // Es wird automatisch gespeichert. Ohne offene Änderungen nur Hinweis –
    // niemals «Gespeichert» anzeigen, wenn nichts gespeichert wurde (SPEC).
    run: (s, d) => {
      // Geöffnetes Journal: ausstehende Änderungen sofort speichern
      if (s.openJournal && s.view === 'journal' && saveNow()) return;
      if (s.saveStatus.kind === 'idle')
        d({ type: 'notice', text: 'Nichts zu speichern – Änderungen werden automatisch gespeichert.' });
    },
  },
  'journal.find': {
    id: 'journal.find',
    label: 'Im Journal suchen',
    shortcut: 'Ctrl+F',
    disabledReason: () => NO_JOURNAL,
    run: () => {},
  },
  'fachbuch.search': {
    id: 'fachbuch.search',
    label: 'Im Fachbuch suchen',
    shortcut: 'Ctrl+Shift+F',
    disabledReason: () => null,
    run: (_s, d) => {
      d({ type: 'navigate', view: 'fachbuch' });
      d({ type: 'requestFocus', target: 'fachbuch-search' });
    },
  },
  // F6/Umschalt+F6 werden in der App-Shell behandelt (brauchen DOM-Fokus)
  'region.next': {
    id: 'region.next',
    label: 'Nächster Bereich',
    shortcut: 'F6',
    disabledReason: () => null,
    run: () => {},
  },
  'region.previous': {
    id: 'region.previous',
    label: 'Vorheriger Bereich',
    shortcut: 'Shift+F6',
    disabledReason: () => null,
    run: () => {},
  },
};
