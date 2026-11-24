// Dokumentansicht eines Journals: «Seite» mit Titel, Metadaten und den
// Abschnitten der Vorlage. Alles wird automatisch gespeichert:
// kurz nach der letzten Änderung, bei Dauertippen spätestens alle 10 Sekunden,
// beim Verlassen der Ansicht und mit Strg+S sofort (SPEC «Autosave»).
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { JSONContent } from '@tiptap/react';
import { Archive, ChevronDown, CircleCheck, Copy, PencilLine, Plus, Trash2 } from 'lucide-react';
import {
  EMPTY_DOCUMENT,
  LEARNING_PLACE_LABELS,
  withSectionDocument,
  type JournalDetail,
  type JournalMeta,
  type JournalSection,
  type JournalTemplateId,
  type Sections,
} from '@shared/journal';
import { newJournalSections, sectionHint } from '@shared/journal-templates';
import { effectiveSchoolYear } from '@shared/school-year';
import { useApp } from '../state/AppContext';
import { SectionEditor } from '../editor/SectionEditor';
import { registerSaveNow, saveOnUnmount } from '../editor/save-registry';
import { ConfirmDialog } from '../shell/ConfirmDialog';
import { deleteJournal, displayTitle, duplicateJournal, formatDate, setJournalStatus } from './actions';
import { StatusBadge } from './StatusBadge';
import { JournalDetails } from './JournalDetails';
import { JournalInsertMenu } from './JournalInsertMenu';
import { JournalSectionActions } from './JournalSectionActions';
import { JournalSectionForm } from './JournalSectionForm';
import { QvMarkButton } from './QvMarkButton';

const SAVE_DELAY_MS = 800; // SPEC: speichern nach kurzer Ruhephase
const MAX_WAIT_MS = 10_000; // SPEC: bei Dauertippen spätestens alle 10 s
// Zeitquelle für die Speicherplanung (nur in Event-Handlern verwendet, nie beim Rendern)
const currentTime = () => Date.now();

function metaOf(j: JournalDetail): JournalMeta {
  return {
    title: j.title,
    workDate: j.workDate,
    learningPlace: j.learningPlace,
    schoolYearOverride: j.schoolYearOverride,
  };
}

const actionButton =
  'inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-hover';

export function JournalDocument({ journal }: { journal: JournalDetail }) {
  const { state, dispatch } = useApp();
  // Im Platzhalter getippter Titel (Strg+N, AJ-17) – nur beim ersten Anzeigen
  // dieses Journals übernommen, danach gilt das eigene Titelfeld
  const [typedTitle] = useState(() =>
    state.newJournalTitle?.journalId === journal.id && state.newJournalTitle.title
      ? state.newJournalTitle.title
      : null,
  );
  const [meta, setMeta] = useState<JournalMeta>(() =>
    typedTitle === null ? metaOf(journal) : { ...metaOf(journal), title: typedTitle },
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [sectionLayout, setSectionLayout] = useState(journal.sections);
  const [confirmRemove, setConfirmRemove] = useState<JournalSection | null>(null);
  const [addedSection, setAddedSection] = useState<string | null>(null);
  // Ausstehende Änderungen, getrennt nach Metadaten und Inhalt
  const pending = useRef<{ meta?: JournalMeta; sections?: Sections }>({});
  const sectionsRef = useRef<Sections>(journal.sections);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstPendingAt = useRef<number | null>(null);
  const saving = useRef<Promise<void> | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  // Speichert ausstehende Änderungen. «Gespeichert» erst nach Bestätigung durch
  // den Hauptprozess (= Transaktion abgeschlossen), sonst Fehlermeldung.
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCount = useRef(0);
  // Verweis auf die aktuelle flush-Funktion (für den automatischen Wiederholversuch)
  const flushRef = useRef<(() => Promise<boolean>) | null>(null);

  const flush = useCallback(async (): Promise<boolean> => {
    if (timer.current) clearTimeout(timer.current);
    if (retryTimer.current) clearTimeout(retryTimer.current);
    timer.current = null;
    retryTimer.current = null;
    // Läuft schon ein Speichervorgang, zuerst diesen abwarten (Reihenfolge wahren)
    if (saving.current) await saving.current;
    const todo = pending.current;
    if (!todo.meta && !todo.sections) return true;
    pending.current = {};
    firstPendingAt.current = null;
    dispatch({ type: 'setSaveStatus', journalId: journal.id, status: { kind: 'saving' } });
    let ok = true;
    const run = (async () => {
      try {
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
      } catch {
        ok = false; // z. B. Hauptprozess nicht erreichbar
      }
      if (ok) {
        retryCount.current = 0;
        // «Gespeichert» nur, wenn wirklich alles gespeichert ist: Kam während
        // des Speicherns schon wieder etwas dazu, bleibt die Anzeige ausstehend.
        const more = pending.current.meta || pending.current.sections;
        dispatch({
          type: 'setSaveStatus',
          journalId: journal.id,
          status: more ? { kind: 'pending' } : { kind: 'saved', at: Date.now() },
        });
      } else {
        // Nichts verlieren: beim nächsten Versuch erneut senden (neuere Änderungen haben Vorrang)
        pending.current = {
          meta: pending.current.meta ?? todo.meta,
          sections: pending.current.sections ?? todo.sections,
        };
        dispatch({
          type: 'setSaveStatus',
          journalId: journal.id,
          status: { kind: 'error', message: 'Wird automatisch erneut versucht.' },
        });
        // Automatisch erneut versuchen: nach 2, 5, 10, dann alle 30 Sekunden
        const delays = [2000, 5000, 10000, 30000];
        const delay = delays[Math.min(retryCount.current, delays.length - 1)]!;
        retryCount.current++;
        retryTimer.current = setTimeout(() => void flushRef.current?.(), delay);
      }
    })();
    saving.current = run;
    await run;
    saving.current = null;
    return ok;
  }, [dispatch, journal.id]);

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  // Ansicht verlassen: geplanten Wiederholversuch beenden (das Aufräumen unten speichert ein letztes Mal)
  useEffect(
    () => () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
    },
    [],
  );

  function schedule() {
    const now = currentTime();
    // Erste ungespeicherte Änderung: ein «Gespeichert» von vorhin trifft nicht
    // mehr zu (ein Fehler bleibt dagegen sichtbar, bis erneut gespeichert ist)
    if (firstPendingAt.current === null && !saving.current && state.saveStatus.kind !== 'error')
      dispatch({ type: 'setSaveStatus', journalId: journal.id, status: { kind: 'pending' } });
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

  function queueSections(sections: Sections) {
    sectionsRef.current = sections;
    pending.current.sections = sections;
    schedule();
  }

  function changeSection(id: string, doc: JSONContent) {
    queueSections(withSectionDocument(sectionsRef.current, id, doc as JournalSection['doc']));
  }

  function changeLayout(sections: Sections) {
    queueSections(sections);
    setSectionLayout(sections);
  }

  function moveSection(id: string, direction: -1 | 1) {
    const sections = [...sectionsRef.current];
    const from = sections.findIndex((section) => section.id === id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= sections.length) return;
    [sections[from], sections[to]] = [sections[to]!, sections[from]!];
    changeLayout(sections);
  }

  function saveSectionHeading(heading: string | null) {
    const id = state.journalSectionForm?.sectionId;
    if (id) {
      changeLayout(
        sectionsRef.current.map((section) => (section.id === id ? { ...section, heading } : section)),
      );
    } else {
      const newId = crypto.randomUUID();
      changeLayout([...sectionsRef.current, { id: newId, heading, doc: structuredClone(EMPTY_DOCUMENT) }]);
      setAddedSection(newId);
    }
    dispatch({ type: 'closeJournalSectionForm' });
  }

  function appendTemplate(template: JournalTemplateId) {
    const sections = newJournalSections(template).map((section) => ({ ...section, id: crypto.randomUUID() }));
    changeLayout([...sectionsRef.current, ...sections]);
    setAddedSection(sections[0]?.id ?? null);
    dispatch({ type: 'closeJournalSectionForm' });
  }

  // Beim Verlassen der Ansicht (Navigation, anderes Journal) sofort speichern
  useEffect(
    () => () => {
      saveOnUnmount(flush);
    },
    [flush],
  );

  // Strg+S: sofort speichern
  useEffect(() => {
    registerSaveNow(flush);
    return () => registerSaveNow(null);
  }, [flush]);

  // Neues, leeres Journal: Cursor direkt in den Titel, ans Ende des schon
  // Getippten. Als Layout-Effekt, damit der Fokus steht, bevor die nächste
  // Taste verarbeitet wird (sonst ginge sie zwischen Platzhalter und Journal verloren).
  useLayoutEffect(() => {
    const input = titleRef.current;
    if (journal.title || !input) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }, [journal.id, journal.title]);

  // Getippten Titel aus dem Platzhalter wie eine eigene Eingabe speichern
  useLayoutEffect(() => {
    if (state.newJournalTitle) dispatch({ type: 'newJournalTitleTaken' });
    if (typedTitle === null) return;
    pending.current.meta = { ...metaOf(journal), title: typedTitle };
    schedule();
    // Nur beim ersten Anzeigen; journal/schedule ändern sich danach bewusst nicht mehr
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const year = effectiveSchoolYear(
    state.project?.profile.apprenticeshipStart ?? null,
    meta.workDate,
    meta.schoolYearOverride,
  );
  const isCompleted = journal.status === 'completed';
  const editingSection = sectionLayout.find(({ id }) => id === state.journalSectionForm?.sectionId);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-4 sm:px-6">
      <article
        className="rounded-lg border border-border bg-surface px-5 py-5 shadow-sm lg:px-10 lg:py-6"
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

        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
            <StatusBadge status={journal.status} />
            <QvMarkButton journal={journal} />
            <span>
              {formatDate(meta.workDate)} · {LEARNING_PLACE_LABELS[meta.learningPlace]}
              {year ? ` · ${year}. Lehrjahr` : ''}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-2">
            <button
              type="button"
              aria-expanded={state.journalDetailsOpen}
              aria-controls="journal-details"
              onClick={() => dispatch({ type: 'toggleJournalDetails' })}
              className="flex min-h-8 items-center gap-1 rounded-md px-2 text-sm font-medium text-accent-strong hover:bg-hover"
            >
              Journaldetails{' '}
              <ChevronDown
                aria-hidden="true"
                size={14}
                className={state.journalDetailsOpen ? 'rotate-180' : ''}
              />
            </button>
            <div
              role="toolbar"
              aria-label="Journal-Aktionen"
              className="flex items-center border-l border-border-subtle pl-1"
            >
              <button
                type="button"
                className={actionButton}
                aria-label={isCompleted ? 'Wieder als Entwurf' : 'Als abgeschlossen markieren'}
                title={isCompleted ? 'Wieder als Entwurf' : 'Als abgeschlossen markieren'}
                onClick={async () => {
                  if (await flush())
                    void setJournalStatus(dispatch, journal.id, isCompleted ? 'draft' : 'completed');
                }}
              >
                {isCompleted ? (
                  <PencilLine aria-hidden="true" size={16} />
                ) : (
                  <CircleCheck aria-hidden="true" size={16} />
                )}
              </button>
              <button
                type="button"
                className={actionButton}
                aria-label="Duplizieren"
                title="Duplizieren"
                onClick={async () => {
                  if (await flush()) void duplicateJournal(dispatch, journal.id);
                }}
              >
                <Copy aria-hidden="true" size={16} />
              </button>
              {journal.status !== 'archived' && (
                <button
                  type="button"
                  className={actionButton}
                  aria-label="Archivieren"
                  title="Archivieren"
                  onClick={async () => {
                    if (await flush()) void setJournalStatus(dispatch, journal.id, 'archived');
                  }}
                >
                  <Archive aria-hidden="true" size={16} />
                </button>
              )}
              <button
                type="button"
                className={actionButton}
                aria-label="Löschen"
                title="Löschen"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 aria-hidden="true" size={16} />
              </button>
            </div>
          </div>
        </div>
        <JournalDetails
          journal={state.openJournal?.id === journal.id ? state.openJournal : journal}
          meta={meta}
          onChange={change}
          onCommit={() => void flush()}
        />

        <div className="mt-3 border-t border-border-subtle">
          {sectionLayout.map(({ id, heading, doc }, index) => (
            <section
              key={id}
              aria-labelledby={heading ? `sec-${id}` : undefined}
              className={heading ? 'mt-4' : 'mt-3 [&_.lj-editor]:min-h-44'}
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                {heading && (
                  <h2 id={`sec-${id}`} className="text-xl font-semibold text-accent-strong">
                    {heading}
                  </h2>
                )}
                <div className="ml-auto">
                  <JournalSectionActions
                    label={heading ?? `Abschnitt ${index + 1}`}
                    canMoveUp={index > 0}
                    canMoveDown={index < sectionLayout.length - 1}
                    onRename={() => dispatch({ type: 'openJournalSectionForm', sectionId: id })}
                    onMove={(direction) => moveSection(id, direction)}
                    onRemove={() => setConfirmRemove({ id, heading, doc })}
                  />
                </div>
              </div>
              <SectionEditor
                journalId={journal.id}
                label={heading ?? 'Inhalt'}
                hint={sectionHint(journal.template, id, heading)}
                content={doc as JSONContent}
                autofocus={addedSection === id}
                onChange={(next) => changeSection(id, next)}
              />
            </section>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => dispatch({ type: 'openJournalSectionForm' })}
            aria-haspopup="dialog"
            className="inline-flex min-h-8 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-accent-strong hover:bg-selected"
          >
            <Plus aria-hidden="true" size={16} /> Abschnitt hinzufügen
          </button>
          <JournalInsertMenu journalId={journal.id} />
        </div>
      </article>

      {state.journalSectionForm && (
        <JournalSectionForm
          current={editingSection?.heading}
          onSubmit={saveSectionHeading}
          onChooseTemplate={editingSection ? undefined : appendTemplate}
          onCancel={() => dispatch({ type: 'closeJournalSectionForm' })}
        />
      )}

      {confirmRemove && (
        <ConfirmDialog
          title="Abschnitt entfernen?"
          confirmLabel="Entfernen"
          danger
          onCancel={() => setConfirmRemove(null)}
          onConfirm={() => {
            changeLayout(sectionsRef.current.filter(({ id }) => id !== confirmRemove.id));
            setConfirmRemove(null);
          }}
        >
          {confirmRemove.heading
            ? `«${confirmRemove.heading}» wird mit seinem Inhalt entfernt.`
            : 'Dieser Abschnitt wird mit seinem Inhalt entfernt.'}
        </ConfirmDialog>
      )}

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
          {(state.openJournalLinks.linked.length > 0 || state.openJournalLinks.mentionedIn.length > 0) && (
            <p className="mt-2">
              Verknüpfungen und Links aus anderen Journalen auf dieses Journal werden entfernt. Der Text der
              anderen Journale bleibt erhalten.
            </p>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}
