// AJ-00b – Editor-Schema (Whitelist aus SPEC «Erlaubte Editor-Knoten»).
//
// Warum hier? Der DOCX-Export darf nur Knoten erhalten, die der Editor
// überhaupt erzeugen kann. Mit demselben Schema prüfen wir die Testdaten:
// Was hier durchgeht, ist echtes Tiptap-JSON und kein erfundenes Format.

import { getSchema, Node, mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';
import { Node as PMNode } from '@tiptap/pm/model';

// Eigener Knoten «figure»: Bild + Legende als EINE Einheit.
// Das Bild selbst liegt nicht im JSON, sondern im Projektordner
// (media/<uuid>.<ext>); hier steht nur die mediaId. So bleibt die
// Datenbank klein und Bilder lassen sich per Hash prüfen (SPEC Medien).
export const Figure = Node.create({
  name: 'figure',
  group: 'block',
  atom: true, // nicht «betretbar»: Legende wird über ein Feld bearbeitet
  addAttributes() {
    return {
      mediaId: { default: null },
      caption: { default: '' },
      alt: { default: '' },
    };
  },
  parseHTML() {
    return [{ tag: 'figure[data-media-id]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['figure', mergeAttributes(HTMLAttributes)];
  },
});

// Erlaubte Erweiterungen. StarterKit bringt mehr mit, als die SPEC erlaubt –
// darum schalten wir Unerlaubtes explizit ab (Code-Blöcke, Zitate, Trennlinie).
export const extensions = [
  StarterKit.configure({
    heading: { levels: [2, 3] }, // H1 ist dem Journaltitel vorbehalten
    codeBlock: false,
    blockquote: false,
    horizontalRule: false,
    link: { openOnClick: false, autolink: false },
  }),
  TableKit.configure({ table: { resizable: false } }),
  Figure,
];

export const schema = getSchema(extensions);

// Prüft ein Tiptap-Dokument gegen das Schema. Wirft bei ungültigem Aufbau.
export function validateDoc(json: unknown): void {
  const node = PMNode.fromJSON(schema, json as Record<string, unknown>);
  node.check();
}

// Typen für den Export. Bewusst locker gehalten, weil das JSON aus der
// Datenbank kommt und vor dem Export ohnehin validiert wird.
export type TiptapMark = { type: string; attrs?: Record<string, unknown> };
export type TiptapNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  text?: string;
  marks?: TiptapMark[];
};
