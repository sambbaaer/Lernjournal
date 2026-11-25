// Ein Rich-Text-Editor für einen Abschnitt (Auftrag, Durchführung oder Reflexion).
// Erlaubte Inhalte bestimmt das gemeinsame Schema (src/shared/editor-schema.ts);
// Eingefügtes aus Word oder dem Web wird automatisch darauf zurechtgestutzt.
import { useEffect, useRef } from 'react';
import { EditorContent, ReactNodeViewRenderer, useEditor, type JSONContent } from '@tiptap/react';
import { Placeholder } from '@tiptap/extensions';
import { baseExtensions, Figure } from '@shared/editor-schema';
import { journalIdFromHref, tagIdFromHref } from '@shared/links';
import type { Merkstelle } from '@shared/merkstellen';
import type { AppState } from '../state/app-state';
import { resolveTypedCrossRef } from './cross-ref';
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
      // Legendenfeld und Knopf «Bild beschriften» gehören sich selbst, nicht dem Editor
      stopEvent: ({ event }) =>
        event.target instanceof HTMLInputElement ||
        (event.target instanceof HTMLElement && !!event.target.closest('.lj-figure-annotate')),
    });
  },
});

export function SectionEditor({
  journalId,
  label,
  hint,
  content,
  autofocus = false,
  onChange,
}: {
  journalId: string;
  label: string;
  hint: string;
  content: JSONContent;
  autofocus?: boolean;
  onChange: (doc: JSONContent) => void;
}) {
  const { setEditor, clearEditor, bump } = useActiveEditor();
  const { state, dispatch } = useApp();
  // Aktueller Stand für Querverweise und Strg+Klick (Ereignisse ausserhalb des Renderns)
  const stateRef = useRef<AppState>(state);
  const merkstellenRef = useRef<Merkstelle[]>([]);
  useEffect(() => {
    stateRef.current = state;
  });
  useEffect(() => {
    void window.lernjournal.search.merkstellen().then((res) => {
      if (res.ok) merkstellenRef.current = res.data;
    });
  }, []);

  const editor = useEditor({
    extensions: [
      ...baseExtensions().map((e) => (e.name === 'figure' ? FigureWithView : e)),
      // Hilfetext als Platzhalter: sichtbar im leeren Abschnitt, nie gespeichert/exportiert
      Placeholder.configure({ placeholder: hint, showOnlyWhenEditable: true }),
    ],
    content,
    autofocus,
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
        const href = a?.getAttribute('href');
        // Querverweis auf ein Schlagwort (AJ-27): Themenansicht im Fachbuch
        const tagId = tagIdFromHref(href);
        if (tagId) {
          event.preventDefault();
          if (stateRef.current.taxonomy.tags.some((t) => t.id === tagId)) {
            dispatch({ type: 'fachbuchChanged', change: { scope: { kind: 'tag', id: tagId }, query: '' } });
            dispatch({ type: 'navigate', view: 'fachbuch' });
          } else dispatch({ type: 'notice', text: 'Dieses Schlagwort gibt es nicht mehr.' });
          return true;
        }
        const id = journalIdFromHref(href);
        if (!id) return false;
        event.preventDefault();
        void openLinkedJournal(dispatch, id);
        return true;
      },
      // Querverweise «[[…]]» (AJ-27):
      //  - zweites «[» direkt nach einem «[» öffnet die Auswahl (Klammern
      //    verschwinden; Esc in der Auswahl gibt sie zurück)
      //  - fertig getipptes «[[Begriff]]» wird beim zweiten «]» zum Link, wenn es
      //    genau ein Schlagwort, eine Merkstelle oder einen Journaltitel so gibt;
      //    sonst bleibt der Text, wie er ist
      handleTextInput: (view, from, to, text) => {
        const { state: es } = view;
        const $from = es.doc.resolve(from);
        if (!$from.parent.isTextblock || from !== to) return false;
        const before = $from.parent.textBetween(
          Math.max(0, $from.parentOffset - 104),
          $from.parentOffset,
          undefined,
          '\ufffc',
        );
        if (text === '[' && before.endsWith('[')) {
          view.dispatch(es.tr.delete(from - 1, to));
          setTimeout(() => dispatch({ type: 'openCrossRef', source: 'brackets' }), 0);
          return true;
        }
        if (text === ']') {
          const m = /\[\[([^[\]\n\ufffc]{1,100})\]$/.exec(before);
          if (!m) return false;
          const term = m[1]!.trim();
          const href = resolveTypedCrossRef(term, {
            journals: stateRef.current.journals,
            tags: stateRef.current.taxonomy.tags,
            merkstellen: merkstellenRef.current,
            excludeJournalId: journalId,
          });
          if (!href || !term) return false;
          const link = es.schema.marks['link']!.create({ href });
          const start = from - m[0].length;
          view.dispatch(es.tr.replaceWith(start, to, [es.schema.text(term, [link]), es.schema.text(' ')]));
          return true;
        }
        return false;
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

  // Sprung aus dem Fachbuch zu einer Merkstelle (AJ-33): Steht sie in diesem
  // Abschnitt, wird sie markiert (echte Auswahl – auch für Bildschirmleser)
  // und in die Mitte gescrollt.
  const reveal = state.revealMerkstelle;
  useEffect(() => {
    if (!editor || editor.isDestroyed || !reveal) return;
    let from = -1;
    let to = -1;
    editor.state.doc.descendants((node, pos) => {
      if (!node.isText) return;
      if (node.marks.some((m) => m.type.name === 'merkstelle' && m.attrs['id'] === reveal)) {
        if (from < 0) from = pos;
        to = pos + node.nodeSize;
      }
    });
    if (from < 0) return;
    editor.chain().focus().setTextSelection({ from, to }).scrollIntoView().run();
    dispatch({ type: 'revealMerkstelle', id: null });
  }, [editor, reveal, dispatch]);

  // Beim Verlassen der Seite den Editor beim Menüband abmelden
  useEffect(
    () => () => {
      if (editor) clearEditor(editor);
    },
    [editor, clearEditor],
  );

  return <EditorContent editor={editor} />;
}
