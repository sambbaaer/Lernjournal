// Dialog «Merkstelle» (AJ-33): markierten Text mit einem Fachbegriff fürs
// Fachbuch versehen – oder Begriff ändern bzw. Merkstelle entfernen.
//
// Der Text bleibt im Journal (Leuchtstift-Markierung). Das Fachbuch zeigt
// unter «Merkstellen» den Begriff, den markierten Text und den Absatz drumherum,
// mit Weg zurück ins Journal. Kein Wiki-Artikel, keine Kopie (SPEC).
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { Editor } from '@tiptap/react';
import { MERKSTELLE_TERM_MAX } from '@shared/editor-schema';

// Vorschlag für den Begriff: markierter Text, gekürzt auf eine Zeile
export function suggestTerm(selected: string): string {
  const oneLine = selected.replace(/\s+/g, ' ').trim();
  return oneLine.length > 60 ? `${oneLine.slice(0, 59)}…` : oneLine;
}

export function MerkstelleDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const existing = editor.isActive('merkstelle');
  const { from, to, empty } = editor.state.selection;
  const selected = editor.state.doc.textBetween(from, to, ' ');
  const [term, setTerm] = useState(() =>
    existing ? String(editor.getAttributes('merkstelle')['term'] ?? '') : suggestTerm(selected),
  );
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.select(), []);

  const close = () => {
    onClose();
    editor.commands.focus();
  };

  function submit(e: FormEvent) {
    e.preventDefault();
    const clean = term.replace(/\s+/g, ' ').trim();
    if (!clean) return setError('Bitte einen Fachbegriff eingeben, z. B. «Tonwertzunahme».');
    onClose();
    if (existing) {
      editor
        .chain()
        .focus()
        .extendMarkRange('merkstelle')
        .updateAttributes('merkstelle', { term: clean })
        .run();
    } else {
      editor.chain().focus().setMark('merkstelle', { id: crypto.randomUUID(), term: clean }).run();
    }
  }

  function remove() {
    onClose();
    editor.chain().focus().extendMarkRange('merkstelle').unsetMark('merkstelle').run();
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  }

  // Ohne Markierung und ohne bestehende Merkstelle gibt es nichts zu markieren
  if (!existing && empty) {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30" onKeyDown={onKeyDown}>
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="merk-title"
          aria-describedby="merk-desc"
          className="w-full max-w-md space-y-3 rounded-md bg-surface p-6 shadow-xl"
        >
          <h2 id="merk-title" className="text-lg font-semibold">
            Merkstelle
          </h2>
          <p id="merk-desc" className="text-sm">
            Markiere zuerst den Text (z. B. einen Satz mit Messwerten oder eine Regel), der im Fachbuch als
            Merkstelle erscheinen soll.
          </p>
          <div className="flex justify-end">
            <button
              type="button"
              autoFocus
              onClick={close}
              className="rounded-sm bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-action-hover"
            >
              OK
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30" onKeyDown={onKeyDown}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="merk-title"
        onSubmit={submit}
        className="w-full max-w-md space-y-3 rounded-md bg-surface p-6 shadow-xl"
      >
        <h2 id="merk-title" className="text-lg font-semibold">
          {existing ? 'Merkstelle bearbeiten' : 'Als Merkstelle ins Fachbuch'}
        </h2>
        <p className="text-sm text-ink-muted">
          Der Text bleibt in diesem Journal. Das Fachbuch zeigt ihn unter dem Fachbegriff mit einem Link
          hierher.
        </p>
        <div>
          <label htmlFor="merk-term" className="mb-1 block text-sm font-semibold">
            Fachbegriff
          </label>
          <input
            ref={inputRef}
            id="merk-term"
            value={term}
            maxLength={MERKSTELLE_TERM_MAX}
            onChange={(e) => setTerm(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'merk-error' : undefined}
            className="w-full rounded-sm border border-border-strong px-3 py-2 text-sm"
          />
          {error && (
            <p id="merk-error" className="mt-1 text-sm text-danger">
              {error}
            </p>
          )}
        </div>
        <div className="flex justify-between gap-2 pt-2">
          <div>
            {existing && (
              <button type="button" onClick={remove} className="rounded-sm px-3 py-2 text-sm hover:bg-hover">
                Merkstelle entfernen
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={close}
              className="rounded-sm border border-border-strong px-4 py-2 text-sm hover:bg-hover"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              className="rounded-sm bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-action-hover"
            >
              Übernehmen
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
