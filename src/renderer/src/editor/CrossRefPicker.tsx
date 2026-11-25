// Querverweis «[[…]]» (AJ-27): Auswahl von Journal, Schlagwort oder Merkstelle.
//
// Öffnet sich nach Eingabe von «[[» im Text oder über «Einfügen → Querverweis».
// Eingefügt wird ein Link (nie eine Kopie):
//   Journal     → Link zum Journal (wie «Link zu Journal», mit «Erwähnt in»)
//   Schlagwort  → Link zur Themenansicht im Fachbuch («lernjournal://tag/…»)
//   Merkstelle  → Link zum Journal der Merkstelle, Text = Fachbegriff
// Esc nach «[[» gibt die zwei Klammern zurück – wer lieber tippt, schreibt
// einfach weiter (z. B. «[[Rakel]]», siehe cross-ref.ts).
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { Editor } from '@tiptap/react';
import { BookmarkCheck, FileText, Tag } from 'lucide-react';
import { journalLinkHref, tagLinkHref } from '@shared/links';
import type { Merkstelle } from '@shared/merkstellen';
import { displayTitle, formatDate } from '../journal/actions';
import { useApp } from '../state/AppContext';
import { crossRefCandidates, type CrossRefItem } from './cross-ref';

const ICONS = { journal: FileText, tag: Tag, merkstelle: BookmarkCheck } as const;
const GROUPS = { journal: 'Journale', tag: 'Schlagwörter (Fachbuch)', merkstelle: 'Merkstellen' } as const;

export function CrossRefPicker({
  editor,
  source,
  onClose,
}: {
  editor: Editor;
  source: 'ribbon' | 'brackets';
  onClose: () => void;
}) {
  const { state } = useApp();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [merkstellen, setMerkstellen] = useState<Merkstelle[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const baseId = useId();

  useEffect(() => {
    inputRef.current?.focus();
    let cancelled = false;
    void window.lernjournal.search.merkstellen().then((res) => {
      if (!cancelled && res.ok) setMerkstellen(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const results = useMemo(
    () =>
      crossRefCandidates({
        query,
        journals: state.journals,
        tags: state.taxonomy.tags,
        merkstellen,
        excludeJournalId: state.openJournal?.id ?? null,
        displayTitle,
        formatDate,
      }),
    [query, state.journals, state.taxonomy.tags, merkstellen, state.openJournal?.id],
  );
  const index = Math.min(active, Math.max(results.length - 1, 0));
  const current = results[index];
  const optionId = (i: number) => `${baseId}-opt-${i}`;

  useEffect(() => {
    document.getElementById(optionId(index))?.scrollIntoView?.({ block: 'nearest' });
  });

  function cancel() {
    onClose();
    const chain = editor.chain().focus();
    // «[[» zurückgeben, damit niemand Getipptes verliert
    if (source === 'brackets') chain.insertContent('[[').run();
    else chain.run();
  }

  function pick(item: CrossRefItem | undefined) {
    if (!item) return;
    onClose();
    const href = item.kind === 'tag' ? tagLinkHref(item.id) : journalLinkHref(item.journalId);
    const chain = editor.chain().focus();
    if (editor.state.selection.empty) {
      // Text des Querverweises einfügen; das Leerzeichen danach beendet den Link
      chain
        .insertContent([
          { type: 'text', text: item.linkText, marks: [{ type: 'link', attrs: { href } }] },
          { type: 'text', text: ' ' },
        ])
        .run();
    } else {
      chain.extendMarkRange('link').setLink({ href }).run();
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cancel();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(Math.min(index + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(Math.max(index - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(current);
    } else if (e.key === 'Tab') {
      e.preventDefault();
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-black/30 pt-[14vh]"
      onKeyDown={onKeyDown}
      onMouseDown={(e) => e.target === e.currentTarget && cancel()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${baseId}-title`}
        className="flex max-h-[min(32rem,calc(100vh-8rem))] w-full max-w-xl flex-col rounded-md bg-surface p-4 shadow-xl"
      >
        <h2 id={`${baseId}-title`} className="text-base font-semibold">
          Querverweis einfügen
        </h2>
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-label="Querverweis suchen"
          aria-expanded="true"
          aria-controls={`${baseId}-list`}
          aria-autocomplete="list"
          aria-activedescendant={current ? optionId(index) : undefined}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          placeholder="Journal, Schlagwort oder Merkstelle"
          className="mt-2 w-full rounded-sm border border-border-strong bg-surface px-2 py-2 text-sm placeholder:text-ink-muted"
        />
        <ul
          id={`${baseId}-list`}
          role="listbox"
          aria-label="Mögliche Ziele"
          className="mt-2 min-h-0 flex-1 overflow-y-auto rounded-sm border border-border py-1"
        >
          {results.length === 0 && (
            <li role="presentation" className="px-3 py-4 text-center text-sm text-ink-muted">
              Nichts gefunden.
            </li>
          )}
          {results.map((item, i) => {
            const newGroup = i === 0 || results[i - 1]!.kind !== item.kind;
            const Icon = ICONS[item.kind];
            return [
              newGroup && (
                <li
                  key={`h-${item.kind}`}
                  role="presentation"
                  className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-ink-muted"
                >
                  {GROUPS[item.kind]}
                </li>
              ),
              <li
                key={`${item.kind}-${item.id}`}
                id={optionId(i)}
                role="option"
                aria-selected={i === index}
                onMouseDown={(e) => e.preventDefault()}
                onMouseMove={() => i !== index && setActive(i)}
                onClick={() => pick(item)}
                className={`mx-1 flex cursor-pointer items-center gap-3 rounded-sm border-l-[3px] px-3 py-1.5 text-sm ${
                  i === index ? 'border-accent bg-selected' : 'border-transparent'
                }`}
              >
                <Icon aria-hidden="true" size={16} className="shrink-0 text-ink-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{item.label}</span>
                  <span className="block truncate text-xs text-ink-muted">{item.detail}</span>
                </span>
              </li>,
            ];
          })}
        </ul>
        <p className="mt-2 text-xs text-ink-muted">
          Eingefügt wird ein Link, nichts wird kopiert. Strg+Klick auf den Link öffnet das Ziel.
        </p>
      </div>
    </div>
  );
}
