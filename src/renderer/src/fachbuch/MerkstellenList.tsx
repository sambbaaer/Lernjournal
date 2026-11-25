// Merkstellen im Fachbuch (AJ-33): Register der markierten Stellen aller
// Journale, nach Fachbegriff A–Z. Jeder Eintrag zeigt den markierten Text,
// den Absatz drumherum und führt mit einem Klick zur Stelle im Journal.
// Der Text steht nur im Journal – hier wird nichts kopiert oder gespeichert.
import { BookmarkCheck } from 'lucide-react';
import type { Merkstelle } from '@shared/merkstellen';
import { displayTitle, formatDate, openLinkedJournal } from '../journal/actions';
import { useApp } from '../state/AppContext';
import { EmptyState } from '../views/EmptyState';
import { groupByLetter } from './fachbuch-logic';

export function MerkstellenList({ items, query }: { items: Merkstelle[]; query: string }) {
  const { dispatch } = useApp();
  if (items.length === 0) {
    return query.trim() ? (
      <p className="rounded-md border border-dashed border-border bg-surface px-4 py-8 text-center text-sm text-ink-muted">
        Keine Merkstelle passt zu «{query.trim()}».
      </p>
    ) : (
      <EmptyState icon={BookmarkCheck} title="Noch keine Merkstellen">
        Markiere im Journal einen Satz, eine Regel oder Messwerte und wähle «Einfügen → Merkstelle». Die
        Stelle erscheint hier unter ihrem Fachbegriff – der Text bleibt im Journal.
      </EmptyState>
    );
  }
  return (
    <div className="space-y-4">
      {groupByLetter(items).map((group) => (
        <section key={group.letter} aria-label={`Buchstabe ${group.letter}`}>
          <h3 className="mb-1 text-sm font-semibold text-ink-muted">{group.letter}</h3>
          <ul className="divide-y divide-border-subtle rounded-md border border-border bg-surface">
            {group.items.map((m) => (
              <li key={m.id} className="space-y-1 px-4 py-3">
                <p className="font-semibold">{m.term}</p>
                {m.text && m.text !== m.term && <p className="text-sm">«{m.text}»</p>}
                {m.context && m.context !== m.text && <p className="text-sm text-ink-muted">{m.context}</p>}
                <button
                  type="button"
                  onClick={() => {
                    // Der Abschnitt mit der Merkstelle markiert sie nach dem Öffnen (SectionEditor)
                    dispatch({ type: 'revealMerkstelle', id: m.id });
                    void openLinkedJournal(dispatch, m.journalId);
                  }}
                  className="text-sm text-accent underline hover:bg-hover"
                >
                  Im Journal «{displayTitle(m.journalTitle)}» ({formatDate(m.workDate)}) öffnen
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
