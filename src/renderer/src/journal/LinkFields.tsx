// Verknüpfungen im geöffneten Journal (AJ-10).
//
//  - «Verknüpft mit»: verwandte Journale. Eine Verknüpfung erscheint in BEIDEN
//    Journalen (Rückverweis) und lässt sich in beiden wieder lösen. Gespeichert
//    wird nur der Verweis, nie eine Kopie des Inhalts.
//  - «Erwähnt in»: Journale, die im Text auf dieses Journal verlinken
//    (Menüband «Einfügen → Link zu Journal»). Nur Anzeige; der Link selbst
//    wird im Text des anderen Journals bearbeitet.
// Alles freiwillig und sofort gespeichert (Leitprinzip Einfachheit).
import { useEffect, useId, useState } from 'react';
import { FileText, Plus, X } from 'lucide-react';
import type { LinkedJournal } from '@shared/links';
import { useApp } from '../state/AppContext';
import {
  displayTitle,
  formatDate,
  linkJournals,
  loadLinks,
  openLinkedJournal,
  unlinkJournals,
} from './actions';
import { JournalPicker } from './JournalPicker';

const chip =
  'inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-canvas py-0.5 pl-2.5 pr-1 text-sm';

export function LinkFields({ journalId }: { journalId: string }) {
  const { state, dispatch } = useApp();
  const { linked, mentionedIn } = state.openJournalLinks;
  const [pickerOpen, setPickerOpen] = useState(false);
  const labelId = useId();
  const mentionId = useId();

  // Beim Öffnen des Journals frisch laden (Titel anderer Journale können sich geändert haben)
  useEffect(() => {
    void loadLinks(dispatch, journalId);
  }, [dispatch, journalId]);

  // Menüband «Journal → Verknüpfen» öffnet die Auswahl. Öffnen direkt beim
  // Rendern (React-Muster «Zustand bei geänderten Daten anpassen», wie bei den
  // Kategorien), die Anfrage danach im Effekt quittieren.
  const requested = state.focusRequest === 'journal-links';
  const [seenRequest, setSeenRequest] = useState(false);
  if (requested !== seenRequest) {
    setSeenRequest(requested);
    if (requested) setPickerOpen(true);
  }
  useEffect(() => {
    if (requested) dispatch({ type: 'requestFocus', target: null });
  }, [requested, dispatch]);

  return (
    <div className="mt-3 grid grid-cols-[auto_1fr] items-start gap-x-4 gap-y-3 text-sm">
      <span id={labelId} className="pt-1 text-ink-muted">
        Verknüpft mit
      </span>
      <div>
        <div className="flex flex-wrap items-center gap-1.5">
          {linked.length > 0 && (
            <ul aria-labelledby={labelId} className="contents">
              {linked.map((j) => (
                <li key={j.id} className={chip}>
                  <JournalButton journal={j} />
                  <button
                    type="button"
                    aria-label={`Verknüpfung mit «${displayTitle(j.title)}» lösen`}
                    title="Verknüpfung lösen (das Journal bleibt bestehen)"
                    onClick={() => void unlinkJournals(dispatch, journalId, j.id)}
                    className="grid size-6 place-items-center rounded-full text-ink-muted hover:bg-hover hover:text-ink"
                  >
                    <X aria-hidden="true" size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            aria-describedby={labelId}
            onClick={() => setPickerOpen(true)}
            className="inline-flex items-center gap-1 rounded-sm px-2 py-1 text-accent hover:bg-hover"
          >
            <Plus aria-hidden="true" size={14} /> Journal verknüpfen …
          </button>
        </div>
        {linked.length === 0 && (
          <p className="mt-1 text-xs text-ink-muted">
            Freiwillig – verbindet verwandte Journale. Der Verweis erscheint in beiden.
          </p>
        )}
      </div>

      {mentionedIn.length > 0 && (
        <>
          <span id={mentionId} className="pt-1 text-ink-muted">
            Erwähnt in
          </span>
          <ul aria-labelledby={mentionId} className="flex flex-wrap items-center gap-1.5">
            {mentionedIn.map((j) => (
              <li key={j.id} className={`${chip} pr-2.5`}>
                <JournalButton journal={j} />
              </li>
            ))}
          </ul>
        </>
      )}

      {pickerOpen && (
        <JournalPicker
          title="Journal verknüpfen"
          confirmLabel="Verknüpfen"
          excludeIds={[journalId]}
          disabledIds={linked.map((j) => j.id)}
          note="Die Verknüpfung erscheint in beiden Journalen. Es wird nichts kopiert."
          onCancel={() => setPickerOpen(false)}
          onPick={(otherId) => {
            setPickerOpen(false);
            void linkJournals(dispatch, journalId, otherId);
          }}
        />
      )}
    </div>
  );
}

// Titel als Knopf: öffnet das verknüpfte Journal (vorher wird gespeichert)
function JournalButton({ journal }: { journal: LinkedJournal }) {
  const { dispatch } = useApp();
  const title = displayTitle(journal.title);
  return (
    <button
      type="button"
      title={`«${title}» vom ${formatDate(journal.workDate)} öffnen`}
      onClick={() => void openLinkedJournal(dispatch, journal.id)}
      className="inline-flex min-w-0 items-center gap-1 rounded-sm text-accent-strong underline-offset-2 hover:underline"
    >
      <FileText aria-hidden="true" size={14} className="shrink-0" />
      <span className="truncate">{title}</span>
      {journal.status === 'archived' && <span className="text-ink-muted">(archiviert)</span>}
    </button>
  );
}
