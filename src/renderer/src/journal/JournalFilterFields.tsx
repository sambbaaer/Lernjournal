// Auswahllisten für Status, Lernort und Lehrjahr (AJ-25). Dieselben Felder
// stehen in der Journalliste und im Menüband (ausserhalb des Editors). Beide
// lesen und schreiben den zentralen Filter (state.journalFilter).
import { useId } from 'react';
import { LEARNING_PLACE_LABELS, LEARNING_PLACES } from '@shared/journal';
import { useApp } from '../state/AppContext';
import type { PlaceFilter, SchoolYearFilter, StatusFilter } from './journal-filter';

export const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'active', label: 'Alle (ohne Archiv)' },
  { id: 'draft', label: 'Entwürfe' },
  { id: 'completed', label: 'Abgeschlossen' },
  { id: 'archived', label: 'Archiviert' },
];

const select = 'rounded-sm border border-border-strong bg-surface px-2 py-1 text-sm';

// Lehrjahr-Werte im <select> sind Text → in den Filtertyp zurückwandeln
function parseSchoolYear(value: string): SchoolYearFilter {
  if (value === 'all' || value === 'none') return value;
  const n = Number(value);
  return n === 1 || n === 2 || n === 3 || n === 4 ? n : 'all';
}

export function JournalFilterFields({
  fields = ['status', 'place', 'schoolYear'],
  onChange,
}: {
  fields?: ('status' | 'place' | 'schoolYear')[];
  // Zusätzlich nach jeder Änderung (z. B. Menüband: zur Journalliste wechseln)
  onChange?: () => void;
}) {
  const { state, dispatch } = useApp();
  const filter = state.journalFilter;
  const id = useId();
  const set = (change: Parameters<typeof dispatch>[0]) => {
    dispatch(change);
    onChange?.();
  };
  return (
    <>
      {fields.includes('status') && (
        <label className="flex items-center gap-2 text-sm" htmlFor={`${id}-status`}>
          Anzeigen
          <select
            id={`${id}-status`}
            value={filter.status}
            onChange={(e) =>
              set({ type: 'setJournalFilter', filter: { status: e.target.value as StatusFilter } })
            }
            className={select}
          >
            {STATUS_FILTERS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {fields.includes('place') && (
        <label className="flex items-center gap-2 text-sm" htmlFor={`${id}-place`}>
          Lernort
          <select
            id={`${id}-place`}
            value={filter.place}
            onChange={(e) =>
              set({ type: 'setJournalFilter', filter: { place: e.target.value as PlaceFilter } })
            }
            className={select}
          >
            <option value="all">Alle</option>
            {LEARNING_PLACES.map((p) => (
              <option key={p} value={p}>
                {LEARNING_PLACE_LABELS[p]}
              </option>
            ))}
          </select>
        </label>
      )}
      {fields.includes('schoolYear') && (
        <label className="flex items-center gap-2 text-sm" htmlFor={`${id}-year`}>
          Lehrjahr
          <select
            id={`${id}-year`}
            value={String(filter.schoolYear)}
            onChange={(e) =>
              set({ type: 'setJournalFilter', filter: { schoolYear: parseSchoolYear(e.target.value) } })
            }
            className={select}
          >
            <option value="all">Alle</option>
            {[1, 2, 3, 4].map((y) => (
              <option key={y} value={y}>
                {y}. Lehrjahr
              </option>
            ))}
            <option value="none">Ohne Lehrjahr</option>
          </select>
        </label>
      )}
    </>
  );
}
