// «Verknüpfte Journale» im Journal: eigene Verweise und Rückverweise anderer
// Journale – dieselbe Beziehung, in beiden Journalen sichtbar, ohne Kopie.
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Link2, Unlink } from 'lucide-react';
import type { LinkedJournal } from '@shared/ipc';
import { useApp } from '../state/AppContext';
import { displayTitle, formatDate, openJournal } from './actions';
import { JournalPicker } from './JournalPicker';

// Andere Teile (Menüband «Link zu Journal») melden neue Verknüpfungen hierher
export const linksChanged = { listeners: new Set<() => void>() };
export function notifyLinksChanged() {
  linksChanged.listeners.forEach((l) => l());
}

export function RelatedJournals({ journalId }: { journalId: string }) {
  const { dispatch } = useApp();
  const [items, setItems] = useState<LinkedJournal[]>([]);
  const [picking, setPicking] = useState(false);

  const reload = useCallback(() => {
    void window.lernjournal.links.list({ journalId }).then((res) => res.ok && setItems(res.data));
  }, [journalId]);

  useEffect(() => {
    reload();
    linksChanged.listeners.add(reload);
    return () => {
      linksChanged.listeners.delete(reload);
    };
  }, [reload]);

  return (
    <section aria-labelledby="related-title" className="mt-10 border-t border-border-subtle pt-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 id="related-title" className="text-base font-semibold">
          Verknüpfte Journale
        </h2>
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="flex items-center gap-1.5 rounded-sm px-2 py-1.5 text-sm hover:bg-hover"
        >
          <Link2 aria-hidden="true" size={16} /> Journal verknüpfen …
        </button>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-ink-muted">
          Noch keine. Verknüpfe verwandte Arbeiten, z. B. «Plattenwechsel» mit «Farbmessung».
        </p>
      ) : (
        <ul
          className="divide-y divide-border-subtle rounded-md border border-border"
          aria-label="Verknüpfte Journale"
        >
          {items.map((l) => (
            <li key={l.journalId} className="flex items-center gap-2 px-3 py-1.5 text-sm">
              {l.direction === 'outgoing' ? (
                <ArrowRight aria-hidden="true" size={15} className="shrink-0 text-ink-muted" />
              ) : (
                <ArrowLeft aria-hidden="true" size={15} className="shrink-0 text-ink-muted" />
              )}
              <button
                type="button"
                onClick={() => void openJournal(dispatch, l.journalId)}
                className="min-w-0 flex-1 truncate text-left text-accent underline-offset-2 hover:underline"
              >
                {displayTitle(l.title)}
              </button>
              <span className="shrink-0 text-xs text-ink-muted">
                {l.direction === 'incoming' ? 'verweist hierher · ' : ''}
                {formatDate(l.workDate)}
              </span>
              <button
                type="button"
                aria-label={`Verknüpfung mit «${displayTitle(l.title)}» entfernen`}
                title="Verknüpfung entfernen"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm hover:bg-hover"
                onClick={() =>
                  void window.lernjournal.links
                    .remove({ journalId, otherId: l.journalId })
                    .then((res) => res.ok && setItems(res.data))
                }
              >
                <Unlink aria-hidden="true" size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {picking && (
        <JournalPicker
          title="Journal verknüpfen"
          excludeId={journalId}
          onCancel={() => setPicking(false)}
          onPick={(hit) => {
            setPicking(false);
            void window.lernjournal.links.add({ sourceId: journalId, targetId: hit.id }).then((res) => {
              if (res.ok) {
                setItems(res.data);
                dispatch({ type: 'notice', text: `Mit «${displayTitle(hit.title)}» verknüpft.` });
              }
            });
          }}
        />
      )}
    </section>
  );
}
