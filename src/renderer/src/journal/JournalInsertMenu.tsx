// «Einfügen»-Auswahl direkt am Ende der Journalseite neben «Abschnitt hinzufügen»:
// Macht es Lernenden so einfach wie in Word, direkt aus der Zwischenablage
// (Text oder Bildschirmfoto mit Win+Umschalt+S), als reinen Text, als Bilddatei
// oder als Tabelle in den aktiven Abschnitt einzufügen.
import { useRef } from 'react';
import { ChevronDown, ClipboardPaste, FileText, Image, Table } from 'lucide-react';
import { BLOCKS, insertBlock, type BlockId } from '../editor/blocks';
import { useActiveEditor } from '../editor/EditorContext';
import { insertImages, pasteFromClipboard, pickImageFiles } from '../editor/insert-image';
import { useApp } from '../state/AppContext';

export function JournalInsertMenu({ journalId }: { journalId: string }) {
  const { dispatch } = useApp();
  const { editor } = useActiveEditor();
  const menu = useRef<HTMLDetailsElement>(null);
  const toggle = useRef<HTMLElement>(null);

  // Wenn noch kein Abschnitt angeklickt wurde, den letzten sichtbaren Abschnitt
  // der Journalseite fokussieren, damit «Einfügen» immer sofort funktioniert.
  function ensureActiveEditor() {
    if (editor && !editor.isDestroyed) return editor;
    const boxes = document.querySelectorAll<HTMLElement>('.lj-editor[contenteditable="true"]');
    const last = boxes[boxes.length - 1];
    last?.focus();
    return null;
  }

  function close() {
    if (menu.current) menu.current.open = false;
  }

  function runPaste(plainText = false) {
    close();
    const target = ensureActiveEditor() ?? editor;
    if (target && !target.isDestroyed) {
      pasteFromClipboard(target, dispatch, { plainText });
    } else {
      // Nach dem Fokussieren einen kurzen Tick warten, bis der Editor angemeldet ist
      setTimeout(() => {
        void window.lernjournal.app
          .pasteInEditor(plainText ? { plainText: true } : undefined)
          .catch(() => null)
          .then((result) => {
            if (!result?.ok || !result.data)
              dispatch({ type: 'notice', text: 'Einfügen war gerade nicht möglich.' });
          });
      }, 0);
    }
  }

  function runPickImage() {
    close();
    const target = ensureActiveEditor() ?? editor;
    if (!target || target.isDestroyed) {
      dispatch({ type: 'notice', text: 'Zuerst in einen Abschnitt des Journals klicken.' });
      return;
    }
    void pickImageFiles().then((files) => insertImages(target, files, journalId, dispatch));
  }

  function runInsertTable() {
    close();
    const target = ensureActiveEditor() ?? editor;
    if (
      !target ||
      target.isDestroyed ||
      !target.can().insertTable({ rows: 3, cols: 3, withHeaderRow: true })
    ) {
      dispatch({ type: 'notice', text: 'Zuerst in einen Abschnitt des Journals klicken.' });
      return;
    }
    target.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  }

  // Fachspezifische Bausteine (Störungstabelle, später Hinweisbox, Checkliste …)
  function runInsertBlock(id: BlockId) {
    close();
    const target = ensureActiveEditor() ?? editor;
    if (!target || target.isDestroyed || !insertBlock(target, id)) {
      dispatch({ type: 'notice', text: 'Hier gerade nicht möglich – zuerst in einen Abschnitt klicken.' });
    }
  }

  function runInsertSymbol(symbol: string) {
    close();
    const target = ensureActiveEditor() ?? editor;
    if (!target || target.isDestroyed) {
      dispatch({ type: 'notice', text: 'Zuerst in einen Abschnitt des Journals klicken.' });
      return;
    }
    target.chain().focus().insertContent(symbol).run();
  }

  const PRINT_SYMBOLS = [
    { label: 'ΔE', title: 'Delta E (Farbabstand)' },
    { label: 'µm', title: 'Mikrometer' },
    { label: '°C', title: 'Grad Celsius' },
    { label: '±', title: 'Plus/Minus (Toleranz)' },
    { label: '×', title: 'Malzeichen (Format, z. B. 70 × 100 cm)' },
    { label: 'g/m²', title: 'Flächengewicht (Grammatur)' },
  ] as const;

  return (
    <details
      ref={menu}
      className="relative"
      onBlur={(event) => {
        if (menu.current && !event.currentTarget.contains(event.relatedTarget)) menu.current.open = false;
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && menu.current?.open) {
          event.stopPropagation();
          close();
          toggle.current?.focus();
        }
      }}
    >
      <summary
        ref={toggle}
        onMouseDown={(e) => e.preventDefault()}
        className=" inline-flex min-h-8 cursor-pointer list-none items-center gap-1.5 rounded-md px-2 text-sm font-medium text-accent-strong hover:bg-selected"
      >
        <ClipboardPaste aria-hidden="true" size={16} /> Einfügen <ChevronDown aria-hidden="true" size={14} />
      </summary>
      <div className="absolute left-0 z-10 mt-1 min-w-64 rounded-md border border-border-strong bg-surface p-1 text-sm shadow-md">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => runPaste(false)}
          className="flex w-full items-center justify-between gap-3 rounded-sm px-2.5 py-1.5 text-left hover:bg-hover"
        >
          <span className="flex items-center gap-2">
            <ClipboardPaste aria-hidden="true" size={16} /> Aus Zwischenablage (Text / Bild)
          </span>
          <span className="text-xs text-ink-muted">Strg+V</span>
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => runPaste(true)}
          className="flex w-full items-center justify-between gap-3 rounded-sm px-2.5 py-1.5 text-left hover:bg-hover"
        >
          <span className="flex items-center gap-2">
            <FileText aria-hidden="true" size={16} /> Nur Text übernehmen
          </span>
          <span className="text-xs text-ink-muted">Strg+Umschalt+V</span>
        </button>
        <div className="my-1 border-t border-border-subtle" />
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={runPickImage}
          className="flex w-full items-center gap-2 rounded-sm px-2.5 py-1.5 text-left hover:bg-hover"
        >
          <Image aria-hidden="true" size={16} /> Bild aus Datei wählen …
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={runInsertTable}
          className="flex w-full items-center gap-2 rounded-sm px-2.5 py-1.5 text-left hover:bg-hover"
        >
          <Table aria-hidden="true" size={16} /> Tabelle einfügen
        </button>
        <div className="my-1 border-t border-border-subtle" />
        <p className="px-2.5 pt-1 text-xs text-ink-muted">Bausteine</p>
        {BLOCKS.map((block) => (
          <button
            key={block.id}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runInsertBlock(block.id)}
            className="flex w-full items-center justify-between gap-3 rounded-sm px-2.5 py-1.5 text-left hover:bg-hover"
          >
            <span>{block.label}</span>
            <span className="text-xs text-ink-muted">{block.description}</span>
          </button>
        ))}
        <div className="my-1 border-t border-border-subtle" />
        <div className="px-2.5 py-1">
          <div className="flex items-center justify-between text-xs text-ink-muted">
            <span>Fachsymbole</span>
            <span>Windows: Win+.</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-1" role="group" aria-label="Fachsymbole einfügen">
            {PRINT_SYMBOLS.map((s) => (
              <button
                key={s.label}
                type="button"
                title={s.title}
                aria-label={`${s.label} (${s.title})`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => runInsertSymbol(s.label)}
                className="rounded-sm border border-border px-2 py-0.5 text-xs font-medium hover:bg-hover"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </details>
  );
}
