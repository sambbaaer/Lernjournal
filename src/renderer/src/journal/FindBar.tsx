// Suchleiste «Im Journal suchen» (Strg+F). Markiert Treffer auf der Journalseite
// (siehe find-in-document.ts); Enter = nächster, Umschalt+Enter = vorheriger Treffer.
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { useApp } from '../state/AppContext';
import { clearPaint, findRanges, paint } from './find-in-document';

export function FindBar() {
  const { dispatch } = useApp();
  const [text, setText] = useState('');
  const [status, setStatus] = useState({ total: 0, active: 0 });
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRef = useRef(0);

  useEffect(() => {
    inputRef.current?.focus();
    return () => clearPaint();
  }, []);

  // step: 0 = neu suchen (erster Treffer), +1 nächster, -1 vorheriger.
  // Sucht jedes Mal neu, damit Änderungen am Text berücksichtigt werden.
  function find(step: 0 | 1 | -1, value = text) {
    const root = document.querySelector('article[aria-label="Journal"]');
    const ranges = root ? findRanges(root, value) : [];
    const n = ranges.length;
    const active = n === 0 ? 0 : step === 0 ? 0 : (activeRef.current + step + n) % n;
    activeRef.current = active;
    paint({ ranges, active });
    setStatus({ total: n, active: n ? active + 1 : 0 });
  }

  // Beim Tippen neu suchen (kurz warten, nicht bei jedem Tastendruck)
  useEffect(() => {
    const t = setTimeout(() => find(0, text), 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nur bei Textänderung
  }, [text]);

  function close() {
    clearPaint();
    dispatch({ type: 'setFindOpen', open: false });
    document.getElementById('document')?.focus();
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'Enter' || e.key === 'F3') {
      e.preventDefault();
      find(e.shiftKey ? -1 : 1);
    }
  }

  const label = !text.trim()
    ? ''
    : status.total === 0
      ? 'Keine Treffer'
      : `${status.active} von ${status.total}`;
  const btn = 'flex h-8 w-8 items-center justify-center rounded-sm hover:bg-hover';

  return (
    <div
      role="search"
      aria-label="Im Journal suchen"
      data-find-ignore
      onKeyDown={onKeyDown}
      className="fixed right-6 top-24 z-30 flex items-center gap-1 rounded-md border border-border bg-surface p-1.5 shadow-lg"
    >
      <label htmlFor="find-input" className="sr-only">
        Suchbegriff
      </label>
      <input
        ref={inputRef}
        id="find-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Im Journal suchen"
        className="w-56 rounded-sm border border-border-strong px-2 py-1 text-sm"
      />
      <span
        className="min-w-24 px-1 text-center text-xs text-ink-muted"
        aria-live="polite"
        data-testid="find-status"
      >
        {label}
      </span>
      <button
        type="button"
        className={btn}
        aria-label="Vorheriger Treffer"
        title="Vorheriger Treffer (Umschalt+Enter)"
        onClick={() => find(-1)}
      >
        <ChevronUp aria-hidden="true" size={16} />
      </button>
      <button
        type="button"
        className={btn}
        aria-label="Nächster Treffer"
        title="Nächster Treffer (Enter)"
        onClick={() => find(1)}
      >
        <ChevronDown aria-hidden="true" size={16} />
      </button>
      <button
        type="button"
        className={btn}
        aria-label="Suche schliessen"
        title="Schliessen (Esc)"
        onClick={close}
      >
        <X aria-hidden="true" size={16} />
      </button>
    </div>
  );
}
