// Platzhalter, solange ein neues Journal angelegt wird (Strg+N, AJ-17).
// Sieht aus wie der Anfang einer leeren Journalseite und hat ein eigenes
// Titelfeld mit Fokus: Wer sofort lostippt, schreibt hier – nie in das
// vorherige Journal, das bis zur Antwort des Hauptprozesses sonst noch
// angezeigt würde. Das Getippte übernimmt das neue Journal beim Anzeigen
// (state.newJournalTitle → JournalDocument) und speichert es.
import { useLayoutEffect, useRef } from 'react';
import { useApp } from '../state/AppContext';

export function NewJournalPending() {
  const { state, dispatch } = useApp();
  const ref = useRef<HTMLInputElement>(null);
  // Fokus noch vor dem nächsten Tastendruck (Layout-Effekt, nicht erst nach dem Zeichnen)
  useLayoutEffect(() => ref.current?.focus(), []);

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-6" aria-busy="true">
      <p role="status" className="mb-3 text-sm text-ink-muted">
        Neues Journal wird angelegt …
      </p>
      <article
        className="rounded-lg border border-border bg-surface px-6 py-8 shadow-sm lg:px-12 lg:py-10"
        aria-label="Journal"
      >
        <label htmlFor="journal-title" className="sr-only">
          Titel des Journals
        </label>
        <input
          ref={ref}
          id="journal-title"
          value={state.creatingJournal?.title ?? ''}
          maxLength={200}
          placeholder="Titel des Journals"
          onChange={(e) => dispatch({ type: 'journalCreatingTitle', title: e.target.value })}
          className="w-full border-0 border-b border-transparent bg-transparent pb-1 text-3xl font-semibold placeholder:text-ink-muted focus:border-accent"
        />
      </article>
    </div>
  );
}
