// Dokumentansicht eines Journals: «Seite» mit Titel, Metadaten und den drei
// Abschnitten (je ein Rich-Text-Editor). Alles wird automatisch gespeichert:
// kurz nach der letzten Änderung, bei Dauertippen spätestens alle 10 Sekunden,
// beim Verlassen der Ansicht und mit Strg+S sofort (SPEC «Autosave»).
import { useCallback, useEffect, useRef, useState } from 'react';
import type { JSONContent } from '@tiptap/react';
import { Archive, CircleCheck, Copy, PencilLine, Trash2 } from 'lucide-react';
import {
  LEARNING_PLACES,
  LEARNING_PLACE_LABELS,
  SECTION_KEYS,
  SECTION_TITLES,
  type JournalDetail,
  type JournalMeta,
  type Sections,
} from '@shared/journal';
import { computeSchoolYear } from '@shared/school-year';
import { useApp } from '../state/AppContext';
import { SectionEditor } from '../editor/SectionEditor';
import { registerSaveNow } from '../editor/save-registry';
import { ConfirmDialog } from '../shell/ConfirmDialog';
import { deleteJournal, displayTitle, duplicateJournal, setJournalStatus } from './actions';
import { StatusBadge } from './StatusBadge';

const SAVE_DELAY_MS = 800; // SPEC: speichern nach kurzer Ruhephase
const MAX_WAIT_MS = 10_000; // SPEC: bei Dauertippen spätestens alle 10 s
// Zeitquelle für die Speicherplanung (nur in Event-Handlern verwendet, nie beim Rendern)
const currentTime = () => Date.now();

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
  // Ausstehende Änderungen, getrennt nach Metadaten und Inhalt
  const pending = useRef<{ meta?: JournalMeta; sections?: Sections }>({});
  const sectionsRef = useRef<Sections>(journal.sections);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstPendingAt = useRef<number | null>(null);
  const saving = useRef<Promise<void> | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  // Speichert ausstehende Änderungen. «Gespeichert» erst nach Bestätigung durch
  // den Hauptprozess (= Transaktion abgeschlossen), sonst Fehlermeldung.
  const flush = useCallback(async (): Promise<void> => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    // Läuft schon ein Speichervorgang, zuerst diesen abwarten (Reihenfolge wahren)
    if (saving.current) await saving.current;
    const todo = pending.current;
    if (!todo.meta && !todo.sections) return;
    pending.current = {};
    firstPendingAt.current = null;
    dispatch({ type: 'setSaveStatus', status: { kind: 'saving' } });
    const run = (async () => {
      let ok = true;
      if (todo.meta) {
        const res = await window.lernjournal.journal.updateMeta({ id: journal.id, meta: todo.meta });
        if (res.ok) dispatch({ type: 'journalUpserted', journal: res.data });
        else ok = false;
      }
      if (todo.sections) {
        const res = await window.lernjournal.journal.updateSections({
          id: journal.id,
          sections: todo.sections,
        });
        if (res.ok) dispatch({ type: 'journalUpserted', journal: res.data });
        else ok = false;
      }
      if (ok) {
        dispatch({ type: 'setSaveStatus', status: { kind: 'saved', at: Date.now() } });
      } else {
        // Nichts verlieren: beim nächsten Versuch erneut senden (neuere Änderungen haben Vorrang)
        pending.current = {
          meta: pending.current.meta ?? todo.meta,
          sections: pending.current.sections ?? todo.sections,
        };
        dispatch({
          type: 'setSaveStatus',
          status: { kind: 'error', message: 'Bitte erneut versuchen (Strg+S).' },
        });
      }
    })();
    saving.current = run;
    await run;
    saving.current = null;
  }, [dispatch, journal.id]);

  function schedule() {
    const now = currentTime();
    firstPendingAt.current ??= now;
    if (timer.current) clearTimeout(timer.current);
    const waited = now - firstPendingAt.current;
    timer.current = setTimeout(() => void flush(), waited >= MAX_WAIT_MS ? 0 : SAVE_DELAY_MS);
  }

  function change(next: JournalMeta) {
    setMeta(next);
    pending.current.meta = next;
    schedule();
  }

  function changeSection(key: keyof Sections, doc: JSONContent) {
    sectionsRef.current = { ...sectionsRef.current, [key]: doc as Sections[typeof key] };
    pending.current.sections = sectionsRef.current;
    schedule();
  }

  // Beim Verlassen der Ansicht (Navigation, anderes Journal) sofort speichern
  useEffect(() => () => void flush(), [flush]);

  // Strg+S: sofort speichern
  useEffect(() => {
    registerSaveNow(flush);
    return () => registerSaveNow(null);
  }, [flush]);

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
            <h2 id={`sec-${k}`} className="mb-2 text-xl font-semibold text-accent-strong">
              {SECTION_TITLES[k]}
            </h2>
            <SectionEditor
              journalId={journal.id}
              label={SECTION_TITLES[k]}
              hint={SECTION_HINTS[k]}
              content={journal.sections[k] as JSONContent}
              onChange={(doc) => changeSection(k, doc)}
            />
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
            pending.current = {}; // nichts mehr speichern, wird gelöscht
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
