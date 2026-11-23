// Ein Rich-Text-Editor für einen Abschnitt (Auftrag, Durchführung oder Reflexion).
// Erlaubte Inhalte bestimmt das gemeinsame Schema (src/shared/editor-schema.ts);
// Eingefügtes aus Word oder dem Web wird automatisch darauf zurechtgestutzt.
import { useEffect } from 'react';
import { EditorContent, useEditor, type JSONContent } from '@tiptap/react';
import { Placeholder } from '@tiptap/extensions';
import { baseExtensions } from '@shared/editor-schema';
import { useActiveEditor } from './EditorContext';

export function SectionEditor({
  label,
  hint,
  content,
  onChange,
}: {
  label: string;
  hint: string;
  content: JSONContent;
  onChange: (doc: JSONContent) => void;
}) {
  const { setEditor, bump } = useActiveEditor();

  const editor = useEditor({
    extensions: [
      ...baseExtensions(),
      // Hilfetext als Platzhalter: sichtbar im leeren Abschnitt, nie gespeichert/exportiert
      Placeholder.configure({ placeholder: hint, showOnlyWhenEditable: true }),
    ],
    content,
    editorProps: {
      attributes: {
        class: 'lj-editor',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': label,
        spellcheck: 'true',
        lang: 'de-CH',
      },
      // Word/HTML-Einfügen: Kommentare und Office-Spezialtags vorab entfernen
      transformPastedHTML: (html) =>
        html
          .replace(/<!--[\s\S]*?-->/g, '')
          .replace(/<\/?o:p>/gi, '')
          .replace(/<\/?(w|m|v|o):[^>]*>/gi, ''),
    },
    onUpdate: ({ editor: e }) => onChange(e.getJSON()),
    onFocus: ({ editor: e }) => {
      setEditor(e);
      bump();
    },
    // Auswahl/Formatierung geändert → Menüband aktualisieren
    onSelectionUpdate: () => bump(),
    onTransaction: () => bump(),
  });

  // Beim Verlassen der Seite den Editor beim Menüband abmelden
  useEffect(
    () => () => {
      if (editor) setEditor(null);
    },
    [editor, setEditor],
  );

  return <EditorContent editor={editor} />;
}
