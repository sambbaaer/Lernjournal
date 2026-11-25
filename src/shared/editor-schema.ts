// Editor-Schema = Whitelist der erlaubten Inhalte (SPEC «Erlaubte Editor-Knoten»).
//
// Wird an ZWEI Stellen verwendet:
//   Renderer:      Tiptap-Editor (was man eingeben/einfügen kann)
//   Hauptprozess:  Prüfung vor dem Speichern (was in die Datenbank darf)
// So kann auch ein manipulierter Renderer keine fremden Knoten, Skript-Links
// oder kaputten Strukturen speichern. Übernommen aus Spike AJ-00b (ADR 0002).
import { getSchema, Mark, mergeAttributes, Node } from '@tiptap/core';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { TableKit } from '@tiptap/extension-table';
import { Node as PMNode } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import { AnnotationsSchema } from './annotations';
import type { Sections } from './journal';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Bild + Legende als EINE Einheit; Bilddatei liegt im Projektordner (AJ-07)
export const Figure = Node.create({
  name: 'figure',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      mediaId: { default: null },
      caption: { default: '' },
      alt: { default: '' },
      // Bild-Schnellbeschriftung (AJ-32): Formen relativ zur Bildgrösse, siehe
      // annotations.ts. Beim Kopieren innerhalb der App als JSON im HTML.
      annotations: {
        default: [],
        parseHTML: (el) => {
          try {
            return JSON.parse(el.getAttribute('data-annotations') ?? '[]');
          } catch {
            return [];
          }
        },
        renderHTML: (attrs) =>
          Array.isArray(attrs['annotations']) && attrs['annotations'].length
            ? { 'data-annotations': JSON.stringify(attrs['annotations']) }
            : {},
      },
    };
  },
  parseHTML() {
    return [{ tag: 'figure[data-media-id]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['figure', mergeAttributes(HTMLAttributes, { 'data-media-id': HTMLAttributes['mediaId'] })];
  },
});

// --- Hinweisbox «Merke», «Achtung», «Tipp» (AJ-28) ------------------------
export const CALLOUT_KINDS = ['merke', 'achtung', 'tipp'] as const;
export type CalloutKind = (typeof CALLOUT_KINDS)[number];
export const CALLOUT_LABELS: Record<CalloutKind, string> = {
  merke: 'Merke',
  achtung: 'Achtung',
  tipp: 'Tipp',
};
const isCalloutKind = (v: unknown): v is CalloutKind => CALLOUT_KINDS.includes(v as CalloutKind);

export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  // Absätze und Listen; keine Tabellen, Bilder oder verschachtelten Boxen (einfach halten)
  content: '(paragraph | bulletList | orderedList | taskList)+',
  defining: true,
  addAttributes() {
    return {
      kind: {
        default: 'merke',
        parseHTML: (el) =>
          isCalloutKind(el.getAttribute('data-callout')) ? el.getAttribute('data-callout') : 'merke',
        renderHTML: (attrs) => ({ 'data-callout': attrs['kind'] }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'aside[data-callout]' }];
  },
  renderHTML({ node, HTMLAttributes }) {
    const kind = isCalloutKind(node.attrs['kind']) ? node.attrs['kind'] : 'merke';
    // role="note" + Beschriftung: Bildschirmleser sagen «Merke, Hinweis» an
    return [
      'aside',
      mergeAttributes(HTMLAttributes, {
        class: 'lj-callout',
        role: 'note',
        'aria-label': CALLOUT_LABELS[kind],
      }),
      0,
    ];
  },
});

// --- Rechenblock «Gegeben / Formel / Rechnung / Ergebnis» (AJ-31) -----------
// Bewusst ohne LaTeX: Lernende schreiben Formeln mit normalem Text und den
// Fachsymbolen aus «Einfügen» (ΔE, µm, ×, g/m² …). Vier feste Zeilen in fester
// Reihenfolge – so sieht jede Rechnung gleich aus und ist im Export eine Tabelle.
export const CALC_ROLES = ['given', 'formula', 'steps', 'result'] as const;
export type CalcRole = (typeof CALC_ROLES)[number];
export const CALC_LABELS: Record<CalcRole, string> = {
  given: 'Gegeben',
  formula: 'Formel',
  steps: 'Rechnung',
  result: 'Ergebnis',
};

export const CalcLine = Node.create({
  name: 'calcLine',
  content: 'inline*',
  defining: true,
  addAttributes() {
    return {
      role: {
        default: 'given',
        parseHTML: (el) => el.getAttribute('data-role'),
        renderHTML: (attrs) => ({ 'data-role': attrs['role'] }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-role]', context: 'calculation/' }];
  },
  renderHTML({ node, HTMLAttributes }) {
    const role = CALC_ROLES.includes(node.attrs['role'] as CalcRole)
      ? (node.attrs['role'] as CalcRole)
      : 'given';
    return [
      'div',
      mergeAttributes(HTMLAttributes, { class: 'lj-calc-line' }),
      ['span', { class: 'lj-calc-label', contenteditable: 'false' }, CALC_LABELS[role]],
      ['span', { class: 'lj-calc-content' }, 0],
    ];
  },
});

export const Calculation = Node.create({
  name: 'calculation',
  group: 'block',
  content: 'calcLine{4}',
  defining: true,
  isolating: true,
  parseHTML() {
    return [{ tag: 'div[data-calculation]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-calculation': '',
        class: 'lj-calc',
        role: 'group',
        'aria-label': 'Rechenblock',
      }),
      0,
    ];
  },
  addKeyboardShortcuts() {
    // Enter springt zur nächsten Zeile (statt die Zeile zu teilen); in der
    // letzten Zeile «Ergebnis» geht es mit einem neuen Absatz unter dem Block weiter.
    // Umschalt+Enter macht wie überall einen Zeilenumbruch.
    return {
      Enter: ({ editor }) => {
        const { $from, empty } = editor.state.selection;
        if (!empty || $from.parent.type.name !== 'calcLine') return false;
        const calc = $from.node($from.depth - 1);
        const index = $from.index($from.depth - 1);
        const calcStart = $from.before($from.depth - 1);
        if (index < calc.childCount - 1) {
          // Anfang der nächsten Zeile: hinter dem Ende der aktuellen Zeile + 1
          const next = $from.after() + 1;
          editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, next)));
          return true;
        }
        const after = calcStart + calc.nodeSize;
        return editor
          .chain()
          .insertContentAt(after, { type: 'paragraph' })
          .setTextSelection(after + 1)
          .run();
      },
    };
  },
});

// --- Merkstelle (AJ-33) -----------------------------------------------------
// Markierter Text im Journal mit einem Fachbegriff. Das Fachbuch zeigt alle
// Merkstellen als Einträge mit Auszug und Rückweg ins Journal. Der Text bleibt
// nur im Journal (Fachbuch = Sicht, keine Kopie).
export const MERKSTELLE_TERM_MAX = 100;
export const Merkstelle = Mark.create({
  name: 'merkstelle',
  inclusive: false, // Weitertippen am Ende gehört nicht mehr zur Merkstelle
  excludes: '', // darf mit Fett, Links usw. kombiniert werden
  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-merkstelle'),
        renderHTML: (a) => ({ 'data-merkstelle': a['id'] }),
      },
      term: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-term') ?? '',
        renderHTML: (a) => ({ 'data-term': a['term'] }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-merkstelle]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        class: 'lj-merkstelle',
        title: `Merkstelle «${String(HTMLAttributes['data-term'] ?? '')}»`,
      }),
      0,
    ];
  },
});

// Erlaubte Link-Ziele: Web (https/http), interne Journal-Links (genau
// «lernjournal://journal/<uuid>», AJ-10) und Querverweise auf Schlagwörter
// («lernjournal://tag/<uuid>», AJ-27, führen in die Themenansicht des Fachbuchs).
// Alles andere (javascript:, file:, data: …) wird weder eingefügt noch gespeichert.
export const ALLOWED_LINK =
  /^(https?:\/\/|lernjournal:\/\/(journal|tag)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$)/i;

export function baseExtensions() {
  return [
    StarterKit.configure({
      heading: { levels: [2, 3] }, // H1 ist dem Journaltitel vorbehalten
      codeBlock: false,
      code: false,
      blockquote: false,
      horizontalRule: false,
      link: {
        openOnClick: false, // nie automatisch öffnen (SPEC)
        autolink: true,
        linkOnPaste: true,
        protocols: ['https', 'http'],
        isAllowedUri: (url) => ALLOWED_LINK.test(url),
        HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: null },
      },
    }),
    TableKit.configure({ table: { resizable: false } }),
    Figure,
    // Abhakbare Checklisten (AJ-29), nicht verschachtelt (einfach im Export)
    TaskList,
    TaskItem.configure({ nested: false }),
    Callout,
    Calculation,
    CalcLine,
    Merkstelle,
  ];
}

export const editorSchema = getSchema(baseExtensions());

export class InvalidContentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidContentError';
  }
}

// Höchstgrösse eines Journals als JSON (ohne Bilder, die liegen separat)
export const MAX_SECTIONS_BYTES = 2_000_000;

// Prüft alle Abschnitte. Wirft InvalidContentError mit verständlicher Meldung.
export function validateSections(sections: Sections): void {
  const size = JSON.stringify(sections).length;
  if (size > MAX_SECTIONS_BYTES) throw new InvalidContentError('Journal ist zu gross.');
  for (const { id, doc } of sections) {
    let node: PMNode;
    try {
      node = PMNode.fromJSON(editorSchema, doc);
      node.check(); // Struktur gemäss Schema (z. B. Tabellenzeilen nur in Tabellen)
    } catch (err) {
      throw new InvalidContentError(`Ungültiger Inhalt im Abschnitt «${id}»: ${(err as Error).message}`);
    }
    node.descendants((n) => {
      // Überschriftenebene: Tiptap prüft Attribute beim Laden nicht – H1 ist dem Titel vorbehalten
      if (n.type.name === 'heading' && ![2, 3].includes(Number(n.attrs['level']))) {
        throw new InvalidContentError('Nur Überschriften der Ebenen 2 und 3 sind erlaubt.');
      }
      // Attribute der neuen Bausteine (AJ-28–AJ-33): nur bekannte Werte
      if (n.type.name === 'callout' && !isCalloutKind(n.attrs['kind'])) {
        throw new InvalidContentError('Unbekannte Art von Hinweisbox.');
      }
      if (n.type.name === 'calculation') {
        const roles: unknown[] = [];
        n.forEach((line) => roles.push(line.attrs['role']));
        if (roles.join() !== CALC_ROLES.join())
          throw new InvalidContentError('Rechenblock ist unvollständig.');
      }
      if (n.type.name === 'taskItem' && typeof n.attrs['checked'] !== 'boolean') {
        throw new InvalidContentError('Ungültiger Punkt einer Checkliste.');
      }
      if (n.type.name === 'figure' && !AnnotationsSchema.safeParse(n.attrs['annotations'] ?? []).success) {
        throw new InvalidContentError('Ungültige Bildbeschriftung.');
      }
      for (const mark of n.marks) {
        // Links prüfen (das Schema selbst kennt keine erlaubten Protokolle)
        if (mark.type.name === 'link' && !ALLOWED_LINK.test(String(mark.attrs['href'] ?? ''))) {
          throw new InvalidContentError('Unzulässiges Link-Ziel.');
        }
        if (mark.type.name === 'merkstelle') {
          const term = String(mark.attrs['term'] ?? '').trim();
          if (!UUID.test(String(mark.attrs['id'] ?? '')) || !term || term.length > MERKSTELLE_TERM_MAX)
            throw new InvalidContentError('Ungültige Merkstelle.');
        }
      }
    });
  }
}
