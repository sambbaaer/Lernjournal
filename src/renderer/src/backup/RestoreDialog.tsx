// Dialog «Sicherung wiederherstellen» (AJ-15). Aufbau und Tastatur wie die
// Dialoge der Projektübergabe: Fokus auf dem Hauptknopf, Tab bleibt im Dialog,
// Esc bricht ab (ausser während gearbeitet wird).
//
// Ablauf: Sicherung prüfen (Hauptprozess, vollständig) → Vorschau mit
// Zeitpunkt, Inhalt im Vergleich zu jetzt, zuletzt bearbeiteten Journalen und
// Wahl «als neues Lernjournal» (empfohlen, SPEC) oder «aktuelles ersetzen»
// (mit Sicherheitskopie vorher) → Fortschritt → Ergebnis. Bei Erfolg ist das
// Ergebnis schon geöffnet; der Dialog bleibt stehen, bis es gelesen ist.
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { CircleAlert, FolderInput, History, LoaderCircle, ShieldCheck } from 'lucide-react';
import { BACKUP_REASON_LABELS, BACKUP_TEXTS, type BackupPreview, type RestoreMode } from '@shared/backup';
import type { ArchiveProgress } from '@shared/archive';
import { plural } from '../archive/archive-actions';
import { saveIfNeeded } from '../editor/save-registry';
import { formatDateTime } from '../project/messages';
import { useApp } from '../state/AppContext';
import {
  chooseRestoreTarget,
  compareLine,
  entryDate,
  previewBackup,
  restoreBackup,
  type RestoreOutcome,
} from './backup-actions';

type Step =
  | { kind: 'working'; label: string }
  | { kind: 'preview'; preview: BackupPreview; targetError?: string }
  | { kind: 'done'; outcome: RestoreOutcome; createdAt: string }
  | { kind: 'error'; message: string };

const primary = 'rounded-sm bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-strong';
const secondary = 'rounded-sm border border-border-strong px-4 py-2 text-sm hover:bg-hover';

export function RestoreDialog({ backupId }: { backupId: string }) {
  const { state, dispatch } = useApp();
  const [step, setStep] = useState<Step>({ kind: 'working', label: 'Sicherung wird geprüft …' });
  const [mode, setMode] = useState<RestoreMode>('new');
  const [progress, setProgress] = useState<ArchiveProgress | null>(null);
  const baseId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<Element | null>(null);
  const close = () => dispatch({ type: 'closeRestore' });

  useEffect(() => {
    returnFocus.current = document.activeElement;
    return () => (returnFocus.current as HTMLElement | null)?.focus?.();
  }, []);
  useEffect(() => {
    (primaryRef.current ?? dialogRef.current)?.focus();
  }, [step.kind]);
  // Fortschritt (gleicher Kanal wie die Projektübergabe) nur während gearbeitet wird
  useEffect(() => {
    if (step.kind !== 'working') return;
    return window.lernjournal.archive.onProgress(setProgress);
  }, [step.kind]);

  // Beim Öffnen: Sicherung prüfen lassen
  useEffect(() => {
    let active = true;
    void previewBackup(backupId).then((out) => {
      if (!active) return;
      setStep(out.kind === 'ready' ? { kind: 'preview', preview: out.preview } : out);
    });
    return () => {
      active = false;
    };
  }, [backupId]);

  async function runChooseTarget() {
    if (step.kind !== 'preview') return;
    const current = step;
    const out = await chooseRestoreTarget(backupId);
    if ('error' in out) setStep({ ...current, targetError: out.error });
    else if (out.target)
      setStep({ ...current, preview: { ...current.preview, target: out.target }, targetError: undefined });
  }

  async function runRestore() {
    if (step.kind !== 'preview') return;
    const createdAt = step.preview.createdAt;
    setProgress(null);
    setStep({
      kind: 'working',
      label:
        mode === 'new'
          ? 'Sicherung wird als neues Lernjournal wiederhergestellt …'
          : 'Lernjournal wird ersetzt …',
    });
    const out = await restoreBackup(backupId, mode, saveIfNeeded);
    if (out.kind === 'restored') {
      // Hauptprozess hat das Ergebnis schon geöffnet → Oberfläche nachziehen
      dispatch({ type: 'projectOpened', project: out.project });
      dispatch({ type: 'notice', text: `Wiederhergestellt: Stand vom ${formatDateTime(createdAt)}` });
      setStep({ kind: 'done', outcome: out, createdAt });
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
      // Im Dialog bleiben; von den Optionsfeldern nur das gewählte (Pfeiltasten wechseln)
      const focusables = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input[type="radio"]:checked:not([disabled])',
        ) ?? [],
      );
      if (focusables.length === 0) return e.preventDefault();
      const i = focusables.indexOf(document.activeElement as HTMLElement);
      e.preventDefault();
      focusables[(i + (e.shiftKey ? -1 : 1) + focusables.length) % focusables.length]?.focus();
    }
  }

  const body = `${baseId}-body`;
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
        className="max-h-[calc(100vh-4rem)] w-full max-w-xl overflow-auto rounded-md bg-surface p-6 shadow-xl"
      >
        <h2 id={`${baseId}-title`} className="text-lg font-semibold">
          {BACKUP_TEXTS.restoreTitle}
        </h2>

        {step.kind === 'working' && (
          <div id={body} className="mt-6 space-y-3 text-sm">
            <p role="status" className="flex items-center gap-2 font-semibold">
              <LoaderCircle aria-hidden="true" size={18} className="animate-spin" />
              {step.label}
            </p>
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
          <PreviewStep
            step={step}
            body={body}
            mode={mode}
            setMode={setMode}
            onChooseTarget={() => void runChooseTarget()}
            radioName={`${baseId}-mode`}
          />
        )}
        {step.kind === 'preview' && (
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={close} className={secondary}>
              Abbrechen
            </button>
            <button ref={primaryRef} type="button" onClick={() => void runRestore()} className={primary}>
              Wiederherstellen
            </button>
          </div>
        )}

        {step.kind === 'done' && (
          <>
            <div id={body} role="status" className="mt-4 space-y-3 text-sm">
              <p className="flex items-start gap-2">
                <ShieldCheck aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-accent-strong" />
                {step.outcome.mode === 'new' ? (
                  <span>
                    Der Stand vom <strong>{formatDateTime(step.createdAt)}</strong> ist als neues Lernjournal
                    geöffnet: {plural(step.outcome.journals, 'Journal', 'Journale')},{' '}
                    {plural(step.outcome.media, 'Bild', 'Bilder')}. Das bisherige Lernjournal ist unverändert
                    (Datei → Öffnen → Zuletzt verwendet).
                  </span>
                ) : (
                  <span>
                    Dein Lernjournal ist auf den Stand vom <strong>{formatDateTime(step.createdAt)}</strong>{' '}
                    zurückgesetzt: {plural(step.outcome.journals, 'Journal', 'Journale')},{' '}
                    {plural(step.outcome.media, 'Bild', 'Bilder')}.
                    {step.outcome.safetyBackup &&
                      ` Der vorherige Stand ist als Sicherung vom ${entryDate(step.outcome.safetyBackup)} gespeichert (Einstellungen → Sicherungen).`}
                  </span>
                )}
              </p>
              {step.outcome.mode === 'new' && (
                <p className="break-all text-ink-muted">Ordner: {step.outcome.project.path}</p>
              )}
              {step.outcome.warnings.length > 0 && (
                <div className="rounded-sm border-l-4 border-warning bg-warning-bg p-3">
                  <p className="font-semibold">Bitte prüfen:</p>
                  <ul className="mt-1 list-disc pl-5">
                    {step.outcome.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="mt-6 flex justify-end">
              <button ref={primaryRef} type="button" onClick={close} className={primary}>
                Schliessen
              </button>
            </div>
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
            <div className="mt-6 flex justify-end">
              <button ref={primaryRef} type="button" onClick={close} className={primary}>
                Schliessen
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PreviewStep({
  step,
  body,
  mode,
  setMode,
  onChooseTarget,
  radioName,
}: {
  step: Extract<Step, { kind: 'preview' }>;
  body: string;
  mode: RestoreMode;
  setMode: (m: RestoreMode) => void;
  onChooseTarget: () => void;
  radioName: string;
}) {
  const p = step.preview;
  // Optionsfeld mit Beschriftung; extra (Ordner + Knopf) steht ausserhalb des
  // <label>, weil ein Knopf in einem Label ungültig wäre
  const option = (value: RestoreMode, label: string, hint: string, extra?: ReactNode) => (
    <div
      className={`rounded-sm border p-3 ${mode === value ? 'border-accent bg-selected' : 'border-border'}`}
    >
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="radio"
          name={radioName}
          value={value}
          checked={mode === value}
          onChange={() => setMode(value)}
          className="mt-1"
        />
        <span className="min-w-0 flex-1 space-y-1">
          <span className="block font-semibold">{label}</span>
          <span className="block text-ink-muted">{hint}</span>
        </span>
      </label>
      {extra && <div className="mt-2 space-y-2 pl-7">{extra}</div>}
    </div>
  );

  return (
    <div id={body} className="mt-4 space-y-4 text-sm">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
        <dt className="text-ink-muted">Stand vom</dt>
        <dd className="flex items-center gap-1.5 font-semibold">
          <History aria-hidden="true" size={16} /> {formatDateTime(p.createdAt)}
        </dd>
        <dt className="text-ink-muted">Anlass</dt>
        <dd>{BACKUP_REASON_LABELS[p.reason]}</dd>
        <dt className="text-ink-muted">Inhalt</dt>
        <dd data-testid="restore-content">
          {compareLine(p.journals, p.current.journals, 'Journal', 'Journale')} ·{' '}
          {compareLine(p.media, p.current.media, 'Bild', 'Bilder')}
        </dd>
        {p.recentTitles.length > 0 && (
          <>
            <dt className="text-ink-muted">Zuletzt bearbeitet</dt>
            <dd>
              <ul className="list-disc pl-5">
                {p.recentTitles.map((t, i) => (
                  <li key={`${i}-${t}`}>{t.trim() ? `«${t}»` : 'Ohne Titel'}</li>
                ))}
              </ul>
            </dd>
          </>
        )}
        <dt className="text-ink-muted">Prüfung</dt>
        <dd>
          {p.missingMedia === 0
            ? 'In Ordnung – alle Prüfsummen stimmen.'
            : `${plural(p.missingMedia, 'Bild fehlt', 'Bilder fehlen')} und ${p.missingMedia === 1 ? 'wird' : 'werden'} als fehlend angezeigt; alles andere ist in Ordnung.`}
        </dd>
      </dl>

      <fieldset className="space-y-2">
        <legend className="mb-1 font-semibold">Wie wiederherstellen?</legend>
        {option(
          'new',
          BACKUP_TEXTS.modeNew,
          BACKUP_TEXTS.modeNewHint,
          mode === 'new' && (
            <>
              <p className="break-all" data-testid="restore-target">
                Neuer Ordner: {p.target}
              </p>
              {step.targetError && (
                <p role="alert" className="flex items-start gap-2 font-semibold text-danger">
                  <CircleAlert aria-hidden="true" size={16} className="mt-0.5 shrink-0" />
                  {step.targetError}
                </p>
              )}
              <button type="button" onClick={onChooseTarget} className={secondary}>
                <FolderInput aria-hidden="true" size={16} className="mr-1.5 inline" />
                Anderen Ordner wählen …
              </button>
            </>
          ),
        )}
        {option('replace', BACKUP_TEXTS.modeReplace, BACKUP_TEXTS.modeReplaceHint)}
      </fieldset>
    </div>
  );
}
