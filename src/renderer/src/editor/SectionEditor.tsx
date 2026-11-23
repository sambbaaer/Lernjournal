// Ein Rich-Text-Editor für einen Abschnitt (Auftrag, Durchführung oder Reflexion).
// Erlaubte Inhalte bestimmt das gemeinsame Schema (src/shared/editor-schema.ts);
// Eingefügtes aus Word oder dem Web wird automatisch darauf zurechtgestutzt.
import { useEffect, useRef } from 'react';
import { EditorContent, ReactNodeViewRenderer, useEditor, type JSONContent } from '@tiptap/react';
import { Placeholder } from '@tiptap/extensions';
import { baseExtensions, Figure } from '@shared/editor-schema';
import { journalIdFromHref } from '@shared/links';
import { openLinkedJournal } from '../journal/actions';
import { useApp } from '../state/AppContext';
import { useActiveEditor } from './EditorContext';
import { FigureView } from './FigureView';
import { insertImages } from './insert-image';

// Bild-Knoten mit eigener Darstellung (Legendenfeld). Eingaben im Legendenfeld
// gehören dem Feld, nicht dem Editor (stopEvent).
const FigureWithView = Figure.extend({
  addNodeView() {
    return ReactNodeViewRenderer(FigureView, {
      stopEvent: ({ event }) => event.target instanceof HTMLInputElement,
    });
  },
});

export function SectionEditor({
  journalId,
  label,
  hint,
  content,
  onChange,
}: {
  journalId: string;
  label: string;
  hint: string;
  content: JSONContent;
  onChange: (doc: JSONContent) => void;
}) {
  const { setEditor, bump } = useActiveEditor();
  const { dispatch } = useApp();

  const editor = useEditor({
    extensions: [
      ...baseExtensions().map((e) => (e.name === 'figure' ? FigureWithView : e)),
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
      // Strg+Klick auf einen Journal-Link öffnet das Journal (wie in Word).
      // Ein einfacher Klick setzt nur die Einfügemarke – Weblinks werden nie
      // automatisch geöffnet (SPEC).
      handleClick: (_view, _pos, event) => {
        if (!(event.ctrlKey || event.metaKey)) return false;
        const a = (event.target as HTMLElement | null)?.closest?.('a');
        const id = journalIdFromHref(a?.getAttribute('href'));
        if (!id) return false;
        event.preventDefault();
        void openLinkedJournal(dispatch, id);
        return true;
      },
      // Bilder per Drag & Drop (aus dem Explorer) an der Drop-Position einfügen
      handleDrop: (view, event, _slice, moved) => {
        const files = Array.from(event.dataTransfer?.files ?? []);
        if (moved || files.length === 0) return false;
        event.preventDefault();
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        if (editorRef.current) void insertImages(editorRef.current, files, journalId, dispatch, pos);
        return true;
      },
      // Bilder aus der Zwischenablage (z. B. Bildschirmfoto mit Win+Umschalt+S)
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []);
        if (files.length === 0) return false;
        event.preventDefault();
        if (editorRef.current) void insertImages(editorRef.current, files, journalId, dispatch);
        return true;
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

  // Editor für die Drop-/Paste-Handler (die vor dem ersten Rendern definiert werden)
  const editorRef = useRef(editor);
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // Beim Verlassen der Seite den Editor beim Menüband abmelden
  useEffect(
    () => () => {
      if (editor) setEditor(null);
    },
    [editor, setEditor],
  );

  return <EditorContent editor={editor} />;
}
