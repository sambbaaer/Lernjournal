// Dokumentansicht eines Journals: «Seite» mit Titel, Metadaten und den drei
// Abschnitten. Metadaten werden automatisch gespeichert (kurz nach der letzten
// Änderung und beim Verlassen). Der Texteditor für die Abschnitte folgt mit AJ-06.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Archive, CircleCheck, Copy, PencilLine, Trash2 } from 'lucide-react';
import {
  LEARNING_PLACES,
  LEARNING_PLACE_LABELS,
  SECTION_KEYS,
  SECTION_TITLES,
  type JournalDetail,
  type JournalMeta,
} from '@shared/journal';
import { computeSchoolYear } from '@shared/school-year';
import { useApp } from '../state/AppContext';
import { ConfirmDialog } from '../shell/ConfirmDialog';
import { deleteJournal, displayTitle, duplicateJournal, setJournalStatus } from './actions';
import { StatusBadge } from './StatusBadge';

const SAVE_DELAY_MS = 600; // SPEC: speichern nach kurzer Ruhephase

const SECTION_HINTS: Record<(typeof SECTION_KEYS)[number], string> = {
  auftrag: 'Was war die Aufgabe, was das Ziel? Für wen (ohne vertrauliche Details)?',
  durchfuehrung:
    'Wie und weshalb hast du gearbeitet? Schritte, Material, Maschinen, Einstellungen, Sicherheit.',
  reflexion: 'Was lief gut, was war schwierig, was machst du nächstes Mal anders?',
};

function metaOf(j: JournalDetail): JournalMeta {
  return {
    title: j.title,
    workDate: j.workDate,
    learningPlace: j.learningPlace,
    schoolYearOverride: j.schoolYearOverride,
  };
}

const field = 'rounded-sm border border-border-strong bg-surface px-2 py-1.5 text-sm';

export function JournalDocument({ journal }: { journal: JournalDetail }) {
  const { state, dispatch } = useApp();
  const [meta, setMeta] = useState<JournalMeta>(() => metaOf(journal));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const pending = useRef<JournalMeta | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  // Speichert ausstehende Änderungen. Status «Gespeichert» erst nach Bestätigung
  // durch den Hauptprozess (= Transaktion abgeschlossen), sonst Fehlermeldung.
  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const toSave = pending.current;
    if (!toSave) return;
    pending.current = null;
    dispatch({ type: 'setSaveStatus', status: { kind: 'saving' } });
    const res = await window.lernjournal.journal.updateMeta({ id: journal.id, meta: toSave });
    if (res.ok) {
      dispatch({ type: 'journalUpserted', journal: res.data });
      dispatch({ type: 'setSaveStatus', status: { kind: 'saved', at: Date.now() } });
    } else {
      pending.current = pending.current ?? toSave; // nicht verlieren: beim nächsten Versuch mitsenden
      dispatch({ type: 'setSaveStatus', status: { kind: 'error', message: 'Bitte erneut versuchen.' } });
    }
  }, [dispatch, journal.id]);

  function change(next: JournalMeta) {
    setMeta(next);
    pending.current = next;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
  }

  // Beim Verlassen der Ansicht (Navigation, anderes Journal) sofort speichern
  useEffect(() => () => void flush(), [flush]);

  // Neues, leeres Journal: Cursor direkt in den Titel
  useEffect(() => {
    if (!journal.title) titleRef.current?.focus();
  }, [journal.id, journal.title]);

  const computed = computeSchoolYear(state.project?.profile.apprenticeshipStart ?? null, meta.workDate);
  const isCompleted = journal.status === 'completed';

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <StatusBadge status={journal.status} />
        <div role="toolbar" aria-label="Journal-Aktionen" className="flex items-center gap-1">
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-sm px-2 py-1.5 text-sm hover:bg-hover"
            onClick={async () => {
              await flush();
              void setJournalStatus(dispatch, journal.id, isCompleted ? 'draft' : 'completed');
            }}
          >
            {isCompleted ? (
              <PencilLine aria-hidden="true" size={16} />
            ) : (
              <CircleCheck aria-hidden="true" size={16} />
            )}
            {isCompleted ? 'Wieder als Entwurf' : 'Als abgeschlossen markieren'}
          </button>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-sm px-2 py-1.5 text-sm hover:bg-hover"
            onClick={async () => {
              await flush();
              void duplicateJournal(dispatch, journal.id);
            }}
          >
            <Copy aria-hidden="true" size={16} /> Duplizieren
          </button>
          {journal.status !== 'archived' && (
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-sm px-2 py-1.5 text-sm hover:bg-hover"
              onClick={async () => {
                await flush();
                void setJournalStatus(dispatch, journal.id, 'archived');
              }}
            >
              <Archive aria-hidden="true" size={16} /> Archivieren
            </button>
          )}
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-sm px-2 py-1.5 text-sm hover:bg-hover"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 aria-hidden="true" size={16} /> Löschen
          </button>
        </div>
      </div>

      {/* Die «Seite»: helle Dokumentfläche wie in Word */}
      <article
        className="rounded-sm border border-border bg-surface px-12 py-10 shadow-sm"
        aria-label="Journal"
      >
        <label htmlFor="journal-title" className="sr-only">
          Titel des Journals
        </label>
        <input
          ref={titleRef}
          id="journal-title"
          value={meta.title}
          maxLength={200}
          placeholder="Titel des Journals"
          onChange={(e) => change({ ...meta, title: e.target.value })}
          onBlur={() => void flush()}
          className="w-full border-0 border-b border-transparent bg-transparent pb-1 text-3xl font-semibold placeholder:text-ink-muted focus:border-accent"
        />

        <div className="mt-4 flex flex-wrap items-end gap-4 border-b border-border-subtle pb-4 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-ink-muted">Arbeitsdatum</span>
            <input
              type="date"
              required
              value={meta.workDate}
              onChange={(e) => e.target.value && change({ ...meta, workDate: e.target.value })}
              onBlur={() => void flush()}
              className={field}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-ink-muted">Lernort</span>
            <select
              value={meta.learningPlace}
              onChange={(e) =>
                change({ ...meta, learningPlace: e.target.value as JournalMeta['learningPlace'] })
              }
              className={field}
            >
              {LEARNING_PLACES.map((p) => (
                <option key={p} value={p}>
                  {LEARNING_PLACE_LABELS[p]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-ink-muted">Lehrjahr</span>
            <select
              value={meta.schoolYearOverride ?? 'auto'}
              onChange={(e) =>
                change({
                  ...meta,
                  schoolYearOverride: e.target.value === 'auto' ? null : Number(e.target.value),
                })
              }
              className={field}
            >
              <option value="auto">
                {computed ? `Automatisch (${computed.year}. Lehrjahr)` : 'Automatisch (kein Lehrbeginn)'}
              </option>
              {[1, 2, 3, 4].map((y) => (
                <option key={y} value={y}>
                  {y}. Lehrjahr
                </option>
              ))}
            </select>
          </label>
        </div>

        {SECTION_KEYS.map((k) => (
          <section key={k} aria-labelledby={`sec-${k}`} className="mt-8">
            <h2 id={`sec-${k}`} className="text-xl font-semibold text-accent-strong">
              {SECTION_TITLES[k]}
            </h2>
            <p className="mt-2 rounded-sm border border-dashed border-border px-3 py-4 text-sm text-ink-muted">
              {SECTION_HINTS[k]}
              <span className="mt-1 block text-xs">
                Der Texteditor folgt im nächsten Entwicklungsschritt.
              </span>
            </p>
          </section>
        ))}
      </article>

      {confirmDelete && (
        <ConfirmDialog
          title="Journal endgültig löschen?"
          confirmLabel="Löschen"
          danger
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false);
            pending.current = null; // nichts mehr speichern, wird gelöscht
            void deleteJournal(dispatch, journal.id);
          }}
        >
          <p>
            «{displayTitle(meta.title)}» wird mit allen Bildern gelöscht. Das lässt sich nicht rückgängig
            machen.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
