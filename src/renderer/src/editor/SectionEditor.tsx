// Ein Rich-Text-Editor für einen Abschnitt (Auftrag, Durchführung oder Reflexion).
// Erlaubte Inhalte bestimmt das gemeinsame Schema (src/shared/editor-schema.ts);
// Eingefügtes aus Word oder dem Web wird automatisch darauf zurechtgestutzt.
import { useEffect, useRef } from 'react';
import { EditorContent, ReactNodeViewRenderer, useEditor, type JSONContent } from '@tiptap/react';
import { Placeholder } from '@tiptap/extensions';
import { baseExtensions, Figure } from '@shared/editor-schema';
import { useApp } from '../state/AppContext';
import { useActiveEditor } from './EditorContext';
import { FigureView } from './FigureView';
import { openJournal } from '../journal/actions';
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
      // Strg+Klick auf einen Link: Journal öffnen bzw. Webseite nach Rückfrage (wie in Word)
      handleClick: (view, pos, event) => {
        if (!(event.ctrlKey || event.metaKey)) return false;
        const link = view.state.doc
          .resolve(pos)
          .marks()
          .find((m) => m.type.name === 'link');
        const href = String(link?.attrs['href'] ?? '');
        if (!href) return false;
        const internal = /^lernjournal:\/\/journal\/([0-9a-f-]{36})$/i.exec(href);
        if (internal) {
          void openJournal(dispatch, internal[1]!).catch(() => undefined);
        } else {
          void window.lernjournal.app.openExternal({ url: href });
        }
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
