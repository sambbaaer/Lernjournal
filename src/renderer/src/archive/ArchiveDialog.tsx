// Dialoge «Projekt übergeben (.ajournal)» und «Projekt importieren
// (.ajournal)» (AJ-14). Aufbau und Tastatur wie der Word-Exportdialog:
// Fokus startet auf dem Hauptknopf, Tab bleibt im Dialog, Esc bricht ab
// (ausser während gearbeitet wird).
//
// Übergeben:  Hinweis → Windows-Dialog «Speichern unter» → Fortschritt → Ergebnis
// Importieren: Hinweis → Windows-Dialog «Öffnen» (Datei wird geprüft) →
//              Vorschau mit Zielordner (änderbar) → Fortschritt → Ergebnis.
//              Bei Erfolg ist das neue Projekt sofort geöffnet; der Dialog
//              bleibt stehen, bis das Ergebnis gelesen ist.
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { CircleAlert, FileCheck2, FolderInput, LoaderCircle, PackageCheck } from 'lucide-react';
import fileIcon from '../../../../assets/file-icon.svg';
import { ARCHIVE_TEXTS, type ArchiveProgress, type ArchiveSummary } from '@shared/archive';
import { formatFileSize } from '@shared/export';
import type { ProjectInfo } from '@shared/ipc';
import { saveIfNeeded } from '../editor/save-registry';
import { useApp } from '../state/AppContext';
import type { ArchiveDialogMode } from '../state/app-state';
import {
  chooseArchive,
  chooseArchiveTarget,
  contentLine,
  exportArchive,
  importArchive,
  originLine,
  plural,
} from './archive-actions';

type Step =
  | { kind: 'intro' }
  | { kind: 'working'; label: string }
  | { kind: 'preview'; fileName: string; summary: ArchiveSummary; target: string; targetError?: string }
  | {
      kind: 'saved';
      fileName: string;
      size: string;
      journals: number;
      media: number;
      warnings: string[];
      lastExportAt: string | null;
    }
  | { kind: 'imported'; project: ProjectInfo; journals: number; media: number; warnings: string[] }
  | { kind: 'error'; message: string };

const primary = 'rounded-sm bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-action-hover';
const secondary = 'rounded-sm border border-border-strong px-4 py-2 text-sm hover:bg-hover';

export function ArchiveDialog({ mode }: { mode: ArchiveDialogMode }) {
  const { state, dispatch } = useApp();
  const [step, setStep] = useState<Step>({ kind: 'intro' });
  const [progress, setProgress] = useState<ArchiveProgress | null>(null);
  const baseId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<Element | null>(null);
  const heading = mode === 'export' ? ARCHIVE_TEXTS.exportTitle : ARCHIVE_TEXTS.importTitle;

  const close = () => dispatch({ type: 'closeArchive' });

  useEffect(() => {
    returnFocus.current = document.activeElement;
    return () => (returnFocus.current as HTMLElement | null)?.focus?.();
  }, []);
  useEffect(() => {
    (primaryRef.current ?? dialogRef.current)?.focus();
  }, [step.kind]);
  // Fortschritt nur anhören, solange gearbeitet wird
  useEffect(() => {
    if (step.kind !== 'working') return;
    return window.lernjournal.archive.onProgress(setProgress);
  }, [step.kind]);

  // Arbeitsschritt beginnen: Fortschritt des vorherigen Vorgangs vergessen
  function startWorking(label: string) {
    setProgress(null);
    setStep({ kind: 'working', label });
  }

  async function runExport() {
    startWorking('Projekt wird gespeichert …');
    const out = await exportArchive(saveIfNeeded);
    if (out.kind === 'canceled') return setStep({ kind: 'intro' });
    setStep(out);
    if (out.kind === 'saved') {
      dispatch({ type: 'notice', text: `Gespeichert: ${out.fileName}` });
      // Erinnerung nach 30 Tagen beginnt von vorn (AJ-15)
      if (out.lastExportAt) dispatch({ type: 'exportRecorded', lastExportAt: out.lastExportAt });
    }
  }

  async function runChoose() {
    startWorking('Datei wird geprüft …');
    const out = await chooseArchive();
    if (out.kind === 'canceled') return setStep({ kind: 'intro' });
    setStep(out.kind === 'ready' ? { ...out, kind: 'preview' } : out);
  }

  async function runChooseTarget() {
    if (step.kind !== 'preview') return;
    const current = step;
    const out = await chooseArchiveTarget();
    if ('error' in out) setStep({ ...current, targetError: out.error });
    else if (out.target) setStep({ ...current, target: out.target, targetError: undefined });
  }

  async function runImport() {
    startWorking('Projekt wird importiert …');
    const out = await importArchive(saveIfNeeded);
    if (out.kind === 'imported') {
      // Hauptprozess hat das neue Projekt schon geöffnet → Oberfläche nachziehen
      dispatch({ type: 'projectOpened', project: out.project });
      dispatch({ type: 'notice', text: `Importiert: ${out.project.title}` });
      setStep(out);
      return;
    }
    setStep(out);
    // Normalerweise bleibt bei einem Fehler das bisherige Projekt offen. Zur
    // Sicherheit den Stand des Hauptprozesses abfragen und übernehmen.
    const res = await window.lernjournal.project.getState().catch(() => null);
    if (res?.ok && res.data.project?.path !== state.project?.path)
      dispatch({ type: 'projectState', ...res.data });
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
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

  const body = `${baseId}-body`;
  const buttons = (...children: ReactNode[]) => (
    <div className="mt-6 flex flex-wrap justify-end gap-2">{children}</div>
  );
  const cancel = (
    <button key="cancel" type="button" onClick={close} className={secondary}>
      Abbrechen
    </button>
  );

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30" onKeyDown={onKeyDown}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${baseId}-title`}
        aria-describedby={body}
        aria-busy={step.kind === 'working'}
        tabIndex={-1}
        className="max-h-[calc(100vh-4rem)] w-full max-w-lg overflow-auto rounded-md bg-surface p-6 shadow-xl"
      >
        <h2 id={`${baseId}-title`} className="flex items-center gap-3 text-lg font-semibold">
          <img src={fileIcon} alt="" width="28" height="28" className="shrink-0" />
          <span>{heading}</span>
        </h2>
        {mode === 'export' && state.project && (
          <p className="mt-1 truncate text-sm text-ink-muted">«{state.project.title}»</p>
        )}

        {step.kind === 'intro' && mode === 'export' && (
          <>
            <div id={body} className="mt-4 space-y-3 text-sm">
              <p>{ARCHIVE_TEXTS.exportIntro}</p>
              <p className="rounded-sm border-l-4 border-accent bg-selected p-3">
                {ARCHIVE_TEXTS.exportStorage}
              </p>
              <p className="text-ink-muted">{ARCHIVE_TEXTS.exportPrivacy}</p>
            </div>
            {buttons(
              cancel,
              <button
                key="go"
                ref={primaryRef}
                type="button"
                onClick={() => void runExport()}
                className={primary}
              >
                Speichern unter …
              </button>,
            )}
          </>
        )}

        {step.kind === 'intro' && mode === 'import' && (
          <>
            <div id={body} className="mt-4 space-y-3 text-sm">
              <p>{ARCHIVE_TEXTS.importIntro}</p>
            </div>
            {buttons(
              cancel,
              <button
                key="go"
                ref={primaryRef}
                type="button"
                onClick={() => void runChoose()}
                className={primary}
              >
                Datei wählen …
              </button>,
            )}
          </>
        )}

        {step.kind === 'working' && (
          <div id={body} className="mt-6 space-y-3 text-sm">
            <p role="status" className="flex items-center gap-2 font-semibold">
              <LoaderCircle aria-hidden="true" size={18} className="animate-spin" />
              {step.label}
            </p>
            {/* Einzelschritte nicht laut vorlesen (wären bei vielen Bildern sehr viele);
                der Balken hat Wert und Beschriftung für Screenreader */}
            <div
              role="progressbar"
              aria-label="Fortschritt"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress?.percent ?? undefined}
              className="h-2 overflow-hidden rounded-full border border-border-strong bg-canvas"
            >
              <div
                className="h-full bg-accent transition-[width]"
                style={{ width: `${progress?.percent ?? 0}%` }}
              />
            </div>
            <p className="min-h-5 text-ink-muted">{progress?.step ?? ''}</p>
          </div>
        )}

        {step.kind === 'preview' && (
          <>
            <div id={body} className="mt-4 space-y-3 text-sm">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
                <dt className="text-ink-muted">Projekt</dt>
                <dd className="font-semibold">{step.summary.title}</dd>
                <dt className="text-ink-muted">Inhalt</dt>
                <dd>{contentLine(step.summary)}</dd>
                <dt className="text-ink-muted">Datei</dt>
                <dd className="break-all">
                  {step.fileName} ({formatFileSize(step.summary.archiveBytes)}), {originLine(step.summary)}
                </dd>
                <dt className="text-ink-muted">Neuer Ordner</dt>
                <dd className="break-all" data-testid="archive-target">
                  {step.target}
                </dd>
              </dl>
              {step.targetError && (
                <p role="alert" className="flex items-start gap-2 font-semibold text-danger">
                  <CircleAlert aria-hidden="true" size={18} className="mt-0.5 shrink-0" />
                  {step.targetError}
                </p>
              )}
              <p className="rounded-sm border-l-4 border-accent bg-selected p-3">
                Es entsteht ein neues Lernjournal in diesem Ordner.
                {state.project && ' Das geöffnete Lernjournal bleibt unverändert und wird geschlossen.'}
              </p>
            </div>
            {buttons(
              cancel,
              <button key="target" type="button" onClick={() => void runChooseTarget()} className={secondary}>
                <FolderInput aria-hidden="true" size={16} className="mr-1.5 inline" />
                Anderen Ordner wählen …
              </button>,
              <button
                key="go"
                ref={primaryRef}
                type="button"
                onClick={() => void runImport()}
                className={primary}
              >
                Importieren
              </button>,
            )}
          </>
        )}

        {step.kind === 'saved' && (
          <>
            <div id={body} role="status" className="mt-4 space-y-3 text-sm">
              <p className="flex items-start gap-2">
                <FileCheck2 aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-accent-strong" />
                <span>
                  Gespeichert als <strong className="break-all">{step.fileName}</strong> ({step.size}) –{' '}
                  {contentLine(step)}. Die Datei wurde nach dem Schreiben vollständig geprüft.
                </span>
              </p>
              <Warnings items={step.warnings} />
              <p className="text-ink-muted">{ARCHIVE_TEXTS.exportStorage}</p>
            </div>
            {buttons(
              <button
                key="show"
                type="button"
                onClick={() => void window.lernjournal.archive.showFile()}
                className={secondary}
              >
                Im Ordner anzeigen
              </button>,
              <button key="close" ref={primaryRef} type="button" onClick={close} className={primary}>
                Schliessen
              </button>,
            )}
          </>
        )}

        {step.kind === 'imported' && (
          <>
            <div id={body} role="status" className="mt-4 space-y-3 text-sm">
              <p className="flex items-start gap-2">
                <PackageCheck aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-accent-strong" />
                <span>
                  <strong>«{step.project.title}»</strong> ist importiert und geöffnet:{' '}
                  {plural(step.journals, 'Journal', 'Journale')}, {plural(step.media, 'Bild', 'Bilder')}. Alle
                  Prüfsummen stimmen.
                </span>
              </p>
              <p className="break-all text-ink-muted">Ordner: {step.project.path}</p>
              <Warnings items={step.warnings} />
            </div>
            {buttons(
              <button key="close" ref={primaryRef} type="button" onClick={close} className={primary}>
                Schliessen
              </button>,
            )}
          </>
        )}

        {step.kind === 'error' && (
          <>
            <p
              id={body}
              role="alert"
              className="mt-4 flex items-start gap-2 text-sm font-semibold text-danger"
            >
              <CircleAlert aria-hidden="true" size={18} className="mt-0.5 shrink-0" />
              {step.message}
            </p>
            {mode === 'import' && (
              <p className="mt-2 text-sm text-ink-muted">
                Ein angefangener Import wird immer wieder entfernt. Dein bisheriges Lernjournal ist davon
                nicht betroffen.
              </p>
            )}
            {buttons(
              <button key="close" type="button" onClick={close} className={secondary}>
                Schliessen
              </button>,
              <button
                key="retry"
                ref={primaryRef}
                type="button"
                onClick={() => void (mode === 'export' ? runExport() : runChoose())}
                className={primary}
              >
                {mode === 'export' ? 'Erneut versuchen' : 'Andere Datei wählen …'}
              </button>,
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Warnings({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-sm border-l-4 border-warning bg-warning-bg p-3">
      <p className="font-semibold">Bitte prüfen:</p>
      <ul className="mt-1 list-disc pl-5">
        {items.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
    </div>
  );
}
