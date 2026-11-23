// Journalliste als Tabelle: Pfeiltasten wählen, Enter öffnet, Entf löscht.
// Aktionen wirken auf die ausgewählte Zeile (wie in Office-Dateilisten).
import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Archive, ArchiveRestore, Copy, FolderOpen, Search, Trash2 } from 'lucide-react';
import { LEARNING_PLACE_LABELS, type JournalSummary } from '@shared/journal';
import { useApp } from '../state/AppContext';
import { ConfirmDialog } from '../shell/ConfirmDialog';
import {
  deleteJournal,
  displayTitle,
  duplicateJournal,
  formatDate,
  openJournal,
  setJournalStatus,
} from './actions';
import { StatusBadge } from './StatusBadge';

type Filter = 'active' | 'draft' | 'completed' | 'archived';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'active', label: 'Alle (ohne Archiv)' },
  { id: 'draft', label: 'Entwürfe' },
  { id: 'completed', label: 'Abgeschlossen' },
  { id: 'archived', label: 'Archiviert' },
];

function matches(j: JournalSummary, filter: Filter, q: string): boolean {
  const statusOk = filter === 'active' ? j.status !== 'archived' : j.status === filter;
  return statusOk && (!q || j.title.toLowerCase().includes(q.toLowerCase()));
}

const toolButton = 'flex items-center gap-1.5 rounded-sm px-2 py-1.5 text-sm hover:bg-hover';

export function JournalList() {
  const { state, dispatch } = useApp();
  const [filter, setFilter] = useState<Filter>('active');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<JournalSummary | null>(null);
  const tableRef = useRef<HTMLTableSectionElement>(null);

  const rows = useMemo(
    () => state.journals.filter((j) => matches(j, filter, query)),
    [state.journals, filter, query],
  );
  const selected = rows.find((j) => j.id === selectedId) ?? null;

  function focusRow(id: string) {
    setSelectedId(id);
    tableRef.current?.querySelector<HTMLElement>(`[data-id="${id}"]`)?.focus();
  }

  function onRowKey(e: KeyboardEvent<HTMLTableRowElement>, j: JournalSummary, i: number) {
    if (e.key === 'ArrowDown' && rows[i + 1]) {
      e.preventDefault();
      focusRow(rows[i + 1]!.id);
    } else if (e.key === 'ArrowUp' && rows[i - 1]) {
      e.preventDefault();
      focusRow(rows[i - 1]!.id);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      void openJournal(dispatch, j.id);
    } else if (e.key === 'Delete') {
      e.preventDefault();
      setConfirmDelete(j);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div role="search" className="relative">
          <label htmlFor="journal-filter-text" className="sr-only">
            Journale nach Titel filtern
          </label>
          <Search
            aria-hidden="true"
            size={16}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted"
          />
          <input
            id="journal-filter-text"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Titel filtern"
            className="w-56 rounded-sm border border-border-strong bg-surface py-1.5 pl-8 pr-2 text-sm placeholder:text-ink-muted"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          Anzeigen
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as Filter)}
            className="rounded-sm border border-border-strong bg-surface px-2 py-1.5 text-sm"
          >
            {FILTERS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <div
          role="toolbar"
          aria-label="Aktionen für ausgewähltes Journal"
          className="ml-auto flex items-center gap-1"
        >
          <button
            type="button"
            className={toolButton}
            disabled={!selected}
            onClick={() => selected && void openJournal(dispatch, selected.id)}
          >
            <FolderOpen aria-hidden="true" size={16} /> Öffnen
          </button>
          <button
            type="button"
            className={toolButton}
            disabled={!selected}
            onClick={() => selected && void duplicateJournal(dispatch, selected.id)}
          >
            <Copy aria-hidden="true" size={16} /> Duplizieren
          </button>
          {selected?.status === 'archived' ? (
            <button
              type="button"
              className={toolButton}
              onClick={() => void setJournalStatus(dispatch, selected.id, 'draft')}
            >
              <ArchiveRestore aria-hidden="true" size={16} /> Wiederherstellen
            </button>
          ) : (
            <button
              type="button"
              className={toolButton}
              disabled={!selected}
              onClick={() => selected && void setJournalStatus(dispatch, selected.id, 'archived')}
            >
              <Archive aria-hidden="true" size={16} /> Archivieren
            </button>
          )}
          <button
            type="button"
            className={toolButton}
            disabled={!selected}
            onClick={() => selected && setConfirmDelete(selected)}
          >
            <Trash2 aria-hidden="true" size={16} /> Löschen
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-border bg-surface px-4 py-8 text-center text-sm text-ink-muted">
          {state.journals.length === 0
            ? 'Noch keine Journale. Mit «Neues Journal» (Strg+N) legst du das erste an.'
            : 'Keine Journale für diese Auswahl.'}
        </p>
      ) : (
        <table className="w-full border-collapse overflow-hidden rounded-md border border-border bg-surface text-sm">
          <caption className="sr-only">
            Journale, {rows.length} Einträge. Pfeiltasten wählen, Enter öffnet, Entf löscht.
          </caption>
          <thead className="bg-ribbon text-left text-ink-muted">
            <tr>
              <th scope="col" className="px-3 py-2 font-semibold">
                Titel
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                Arbeitsdatum
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                Lehrjahr
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                Lernort
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                Status
              </th>
            </tr>
          </thead>
          <tbody ref={tableRef}>
            {rows.map((j, i) => {
              const isSel = j.id === selected?.id;
              return (
                <tr
                  key={j.id}
                  data-id={j.id}
                  tabIndex={isSel || (!selected && i === 0) ? 0 : -1}
                  aria-selected={isSel}
                  onClick={() => setSelectedId(j.id)}
                  onFocus={() => setSelectedId(j.id)}
                  onDoubleClick={() => void openJournal(dispatch, j.id)}
                  onKeyDown={(e) => onRowKey(e, j, i)}
                  className={`cursor-default border-t border-border-subtle ${isSel ? 'bg-selected' : 'hover:bg-hover'}`}
                >
                  <td className={`px-3 py-2 ${j.title.trim() ? 'font-semibold' : 'italic text-ink-muted'}`}>
                    {displayTitle(j.title)}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{formatDate(j.workDate)}</td>
                  <td className="px-3 py-2">{j.schoolYear ? `${j.schoolYear}.` : '–'}</td>
                  <td className="px-3 py-2">{LEARNING_PLACE_LABELS[j.learningPlace]}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={j.status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Journal endgültig löschen?"
          confirmLabel="Löschen"
          danger
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => {
            const id = confirmDelete.id;
            setConfirmDelete(null);
            void deleteJournal(dispatch, id);
          }}
        >
          <p>
            «{displayTitle(confirmDelete.title)}» wird mit allen Bildern gelöscht. Das lässt sich nicht
            rückgängig machen.
          </p>
          <p className="mt-2 text-ink-muted">
            Tipp: Mit «Archivieren» verschwindet ein Journal aus der Liste, bleibt aber erhalten.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
