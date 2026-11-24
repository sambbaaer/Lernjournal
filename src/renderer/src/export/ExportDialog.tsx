// Dialog «Als Word exportieren» (AJ-12) – auch für das Sammel-DOCX (AJ-13,
// «Mehrere Journale als Word exportieren»): gleicher Ablauf, dazu der Hinweis,
// dass Word das Inhaltsverzeichnis beim Öffnen aktualisiert.
//
// Ablauf in einem Fenster, damit nichts übersehen wird:
//   1. Hinweis vor dem Weitergeben (R-10) – bei JEDEM Export, einmal bestätigen
//   2. Windows-Dialog «Speichern unter» (zeigt der Hauptprozess)
//   3. Ergebnis: Dateiname und Grösse, allfällige Hinweise, «Im Ordner anzeigen»
// Abbrechen im Speichern-Dialog schliesst einfach (kein Fehler).
//
// Tastatur: Fokus startet auf «Verstanden, weiter», Tab bleibt im Dialog,
// Esc bricht ab (ausser während das Dokument erstellt wird).
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { CircleAlert, FileCheck2, LoaderCircle, ShieldAlert } from 'lucide-react';
import { COLLECTION_TOC_HINT, DEFAULT_COLLECTION_TITLE, EXPORT_NOTICE } from '@shared/export';
import { saveIfNeeded } from '../editor/save-registry';
import { displayTitle } from '../journal/actions';
import { useApp } from '../state/AppContext';
import { exportCollectionDocx, exportJournalDocx, type ExportOutcome } from './export-actions';

type Step = { kind: 'notice' } | { kind: 'working' } | Exclude<ExportOutcome, { kind: 'canceled' }>;

const primary = 'rounded-sm bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-strong';
const secondary = 'rounded-sm border border-border-strong px-4 py-2 text-sm hover:bg-hover';

export function ExportDialog({
  journalIds,
  collection,
}: {
  journalIds: string[];
  collection?: { title: string }; // gesetzt = Sammel-DOCX in der Reihenfolge von journalIds
}) {
  const { state, dispatch } = useApp();
  const [step, setStep] = useState<Step>({ kind: 'notice' });
  const baseId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<Element | null>(null);
  const journalId = journalIds[0]!;
  const heading = collection ? 'Mehrere Journale als Word exportieren' : 'Als Word exportieren';
  // Unter der Überschrift: Journaltitel bzw. Titel der Sammlung mit Anzahl
  const subtitle = collection
    ? `«${collection.title.trim() || DEFAULT_COLLECTION_TITLE}» · ${journalIds.length} ${
        journalIds.length === 1 ? 'Journal' : 'Journale'
      }`
    : `«${displayTitle(state.journals.find((j) => j.id === journalId)?.title ?? '')}»`;

  const close = () => dispatch({ type: 'closeExport' });

  // Fokus beim Öffnen merken und beim Schliessen zurückgeben
  useEffect(() => {
    returnFocus.current = document.activeElement;
    return () => (returnFocus.current as HTMLElement | null)?.focus?.();
  }, []);
  // Bei jedem Schritt den Hauptknopf fokussieren (Enter = weiter)
  useEffect(() => {
    (primaryRef.current ?? dialogRef.current)?.focus();
  }, [step.kind]);

  async function run() {
    setStep({ kind: 'working' });
    const outcome = collection
      ? await exportCollectionDocx(journalIds, collection.title, saveIfNeeded)
      : await exportJournalDocx(journalId, saveIfNeeded);
    if (outcome.kind === 'canceled') return close();
    setStep(outcome);
    if (outcome.kind === 'saved') dispatch({ type: 'notice', text: `Gespeichert: ${outcome.fileName}` });
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation(); // nicht zusätzlich das Datei-Menü o. Ä. schliessen
      if (step.kind !== 'working') close();
    } else if (e.key === 'Tab') {
      const focusables = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? [],
      );
      if (focusables.length === 0) return e.preventDefault();
      const i = focusables.indexOf(document.activeElement as HTMLElement);
      e.preventDefault();
      focusables[(i + (e.shiftKey ? -1 : 1) + focusables.length) % focusables.length]?.focus();
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30" onKeyDown={onKeyDown}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${baseId}-title`}
        aria-describedby={`${baseId}-body`}
        aria-busy={step.kind === 'working'}
        tabIndex={-1}
        className="max-h-[calc(100vh-4rem)] w-full max-w-lg overflow-auto rounded-md bg-surface p-6 shadow-xl"
      >
        <h2 id={`${baseId}-title`} className="text-lg font-semibold">
          {heading}
        </h2>
        <p className="mt-1 truncate text-sm text-ink-muted">{subtitle}</p>

        {step.kind === 'notice' && (
          <>
            <div id={`${baseId}-body`} className="mt-4 space-y-3 text-sm">
              <h3 className="flex items-center gap-2 font-semibold">
                <ShieldAlert aria-hidden="true" size={18} className="text-accent-strong" />
                {EXPORT_NOTICE.title}
              </h3>
              <p>{EXPORT_NOTICE.intro}</p>
              <ul className="list-disc space-y-1.5 pl-5">
                {EXPORT_NOTICE.points.map((p) => (
                  <li key={p.label}>
                    <strong>{p.label}:</strong> {p.text}
                  </li>
                ))}
              </ul>
              <p className="rounded-sm border-l-4 border-accent bg-selected p-3">{EXPORT_NOTICE.oneWay}</p>
              {collection && <p className="text-ink-muted">{COLLECTION_TOC_HINT}</p>}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={close} className={secondary}>
                Abbrechen
              </button>
              <button ref={primaryRef} type="button" onClick={() => void run()} className={primary}>
                {EXPORT_NOTICE.confirm} …
              </button>
            </div>
          </>
        )}

        {step.kind === 'working' && (
          <p id={`${baseId}-body`} role="status" className="mt-6 flex items-center gap-2 text-sm">
            <LoaderCircle aria-hidden="true" size={18} className="animate-spin" />
            Word-Dokument wird erstellt …
          </p>
        )}

        {step.kind === 'saved' && (
          <>
            <div id={`${baseId}-body`} role="status" className="mt-4 space-y-3 text-sm">
              <p className="flex items-start gap-2">
                <FileCheck2 aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-accent-strong" />
                <span>
                  Gespeichert als <strong className="break-all">{step.fileName}</strong> ({step.size}).
                </span>
              </p>
              {step.warnings.length > 0 && (
                <div className="rounded-sm border-l-4 border-danger bg-danger-bg p-3">
                  <p className="font-semibold">Bitte im Dokument prüfen:</p>
                  <ul className="mt-1 list-disc pl-5">
                    {step.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
              {collection && <p>{COLLECTION_TOC_HINT}</p>}
              <p className="text-ink-muted">{EXPORT_NOTICE.oneWay}</p>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => void window.lernjournal.export.showFile()}
                className={secondary}
              >
                Im Ordner anzeigen
              </button>
              <button ref={primaryRef} type="button" onClick={close} className={primary}>
                Schliessen
              </button>
            </div>
          </>
        )}

        {step.kind === 'error' && (
          <>
            <p
              id={`${baseId}-body`}
              role="alert"
              className="mt-4 flex items-start gap-2 text-sm font-semibold text-danger"
            >
              <CircleAlert aria-hidden="true" size={18} className="mt-0.5 shrink-0" />
              {step.message}
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={close} className={secondary}>
                Schliessen
              </button>
              <button ref={primaryRef} type="button" onClick={() => void run()} className={primary}>
                Erneut versuchen
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
