// Fachspezifische Bausteine für «Einfügen» (Menüband und Menü im Dokument).
//
// Jeder Baustein ist reines Tiptap-JSON aus erlaubten Knoten des gemeinsamen
// Schemas (src/shared/editor-schema.ts). Dadurch gelten automatisch dieselben
// Regeln für Prüfung, Suche, Word- und PDF-Export wie für alles andere.
import type { Editor, JSONContent } from '@tiptap/react';
import { CALC_ROLES, type CalloutKind } from '@shared/editor-schema';

const p = (text = ''): JSONContent =>
  text ? { type: 'paragraph', content: [{ type: 'text', text }] } : { type: 'paragraph' };
const header = (text: string): JSONContent => ({ type: 'tableHeader', content: [p(text)] });
const cell = (): JSONContent => ({ type: 'tableCell', content: [p()] });

// Störungstabelle (AJ-30): Symptom → Ursache → Massnahme. Bewusst eine
// gewöhnliche Tabelle mit Kopfzeile – kein eigener Knoten, darum ohne
// Änderung am Datenformat, im Word-Export mit wiederholter Kopfzeile.
export function troubleshootingTable(rows = 2): JSONContent {
  return {
    type: 'table',
    content: [
      { type: 'tableRow', content: ['Symptom', 'Ursache', 'Massnahme'].map(header) },
      ...Array.from({ length: rows }, () => ({ type: 'tableRow', content: [cell(), cell(), cell()] })),
    ],
  };
}

// Hinweisbox (AJ-28) mit einem leeren Absatz zum Losschreiben
export function callout(kind: CalloutKind): JSONContent {
  return { type: 'callout', attrs: { kind }, content: [p()] };
}

// Checkliste (AJ-29) mit einem leeren Punkt
export function checklist(): JSONContent {
  return {
    type: 'taskList',
    content: [{ type: 'taskItem', attrs: { checked: false }, content: [p()] }],
  };
}

// Rechenblock (AJ-31): vier feste Zeilen
export function calculation(): JSONContent {
  return { type: 'calculation', content: CALC_ROLES.map((role) => ({ type: 'calcLine', attrs: { role } })) };
}

export type BlockId = 'merke' | 'achtung' | 'tipp' | 'checklist' | 'calculation' | 'troubleshooting';

export const BLOCKS: { id: BlockId; label: string; description: string }[] = [
  { id: 'merke', label: 'Merke', description: 'Hinweisbox für Wichtiges' },
  { id: 'achtung', label: 'Achtung', description: 'Hinweisbox für Gefahren und Fehler' },
  { id: 'tipp', label: 'Tipp', description: 'Hinweisbox für Tricks' },
  { id: 'checklist', label: 'Checkliste', description: 'Punkte zum Abhaken' },
  { id: 'calculation', label: 'Rechenblock', description: 'Gegeben, Formel, Rechnung, Ergebnis' },
  { id: 'troubleshooting', label: 'Störungstabelle', description: 'Symptom → Ursache → Massnahme' },
];

export function blockContent(id: BlockId): JSONContent {
  switch (id) {
    case 'merke':
    case 'achtung':
    case 'tipp':
      return callout(id);
    case 'checklist':
      return checklist();
    case 'calculation':
      return calculation();
    case 'troubleshooting':
      return troubleshootingTable();
  }
}

// Hinweisbox umschalten: markierten Text in eine Box legen, die Art einer
// bestehenden Box ändern oder – gleiche Art nochmals gewählt – die Box auflösen.
export function toggleCallout(editor: Editor, kind: CalloutKind): boolean {
  if (editor.isActive('callout', { kind })) return editor.chain().focus().lift('callout').run();
  if (editor.isActive('callout')) return editor.chain().focus().updateAttributes('callout', { kind }).run();
  // Erst versuchen, den aktuellen Absatz/die Markierung einzupacken …
  if (editor.can().wrapIn('callout', { kind }))
    return editor.chain().focus().wrapIn('callout', { kind }).run();
  // … sonst (z. B. in einer Überschrift) eine leere Box einfügen
  return editor.chain().focus().insertContent(callout(kind)).run();
}

// Baustein an der Einfügemarke einfügen. Liefert false, wenn es dort nicht
// geht (z. B. eine Tabelle in einer Tabelle).
export function insertBlock(editor: Editor, id: BlockId): boolean {
  if (id === 'merke' || id === 'achtung' || id === 'tipp') return toggleCallout(editor, id);
  if (id === 'checklist') {
    if (editor.can().toggleTaskList()) return editor.chain().focus().toggleTaskList().run();
  }
  const content = blockContent(id);
  // Tabellen und Rechenblöcke nie in Tabellen oder Rechenblöcke verschachteln
  if (
    (content.type === 'table' || content.type === 'calculation') &&
    (editor.isActive('table') || editor.isActive('calculation'))
  )
    return false;
  if (!editor.can().insertContent(content)) return false;
  const ok = editor.chain().focus().insertContent(content).run();
  // Nach dem Einfügen steht die Einfügemarke am Ende des Bausteins. Beim
  // Rechenblock soll man oben bei «Gegeben» beginnen.
  if (ok && content.type === 'calculation') {
    const { $from } = editor.state.selection;
    for (let d = $from.depth; d > 0; d--) {
      if ($from.node(d).type.name === 'calculation') {
        editor.commands.setTextSelection($from.start(d) + 1);
        break;
      }
    }
  }
  return ok;
}
