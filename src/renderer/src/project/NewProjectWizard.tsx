// Assistent «Neues Lernjournal» (SPEC «Erster Start»): 3 Schritte
//   1. Speicherort und Name  2. Profil  3. Vorschlag-Kategorien
// Sinnvolle Standardwerte: Mit dreimal «Weiter» ist das Projekt angelegt.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { JOURNAL_REMINDER } from '@shared/backup';
import { BIPLA_CATEGORIES } from '@shared/bipla';
import type { FolderKind, Profile } from '@shared/ipc';
import { useApp } from '../state/AppContext';
import { ErrorMessage, SyncWarning, UnofficialHint } from './Notices';
import { ProfileFields } from './ProfileFields';
import { useProjectActions } from './useProjectActions';

const STEPS = ['Speicherort', 'Profil', 'Kategorien'] as const;

const FOLDER_PROBLEMS: Partial<Record<FolderKind, string>> = {
  project: 'In diesem Ordner gibt es bereits ein Lernjournal. Öffne es über «Vorhandenes öffnen».',
  'not-empty': 'Der Ordner enthält bereits andere Dateien. Bitte einen leeren oder neuen Ordner wählen.',
  'not-a-folder': 'Das ist kein Ordner.',
  'not-allowed': 'Dieser Ordner kann nicht verwendet werden.',
};

export function NewProjectWizard() {
  const { state, dispatch } = useApp();
  const actions = useProjectActions();
  const [step, setStep] = useState(0);
  const [location, setLocation] = useState(state.suggestedLocation);
  const [folder, setFolder] = useState<{ kind: FolderKind; syncProvider: string | null } | null>(null);
  const [title, setTitle] = useState('Mein Lernjournal');
  const [profile, setProfile] = useState<Profile>({
    displayName: '',
    company: null,
    apprenticeshipStart: null,
    specialization: 'print',
  });
  const [seed, setSeed] = useState(true);
  const [reminderOptIn, setReminderOptIn] = useState(state.journalReminderEnabled);
  const [reminderDays, setReminderDays] = useState(state.journalReminderDays);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Ordner prüfen, sobald er feststeht (leer? schon Projekt? Cloud?)
  useEffect(() => {
    if (!location) return;
    let cancelled = false;
    void window.lernjournal.project.inspectFolder({ path: location }).then((res) => {
      if (!cancelled && res.ok) setFolder(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [location]);

  // Bei jedem Schritt Fokus auf die Überschrift (Screenreader liest den neuen Schritt)
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const folderProblem = folder ? FOLDER_PROBLEMS[folder.kind] : undefined;
  const canContinue =
    step !== 0 || (Boolean(location) && folder !== null && !folderProblem && title.trim().length > 0);

  async function chooseFolder() {
    const res = await window.lernjournal.project.chooseFolder({ purpose: 'create' });
    if (res.ok && res.data.path) {
      setFolder(null);
      setLocation(res.data.path);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!canContinue) return;
    if (step < STEPS.length - 1) return setStep(step + 1);
    dispatch({
      type: 'setJournalReminder',
      enabled: reminderOptIn,
      days: reminderDays,
      snoozedUntil: null,
    });
    void actions.create({ path: location, title: title.trim(), profile, seedCategories: seed });
  }

  return (
    <main
      id="document"
      data-region="document"
      tabIndex={-1}
      className="min-h-0 flex-1 relative overflow-auto bg-canvas"
    >
      <form
        onSubmit={submit}
        className="mx-auto max-w-2xl space-y-6 px-8 py-10"
        aria-labelledby="wizard-title"
        noValidate
      >
        <div>
          <p className="text-sm text-ink-muted">
            Neues Lernjournal · Schritt {step + 1} von {STEPS.length}
          </p>
          <h1 id="wizard-title" ref={headingRef} tabIndex={-1} className="mt-1 text-2xl font-semibold">
            {STEPS[step]}
          </h1>
          <ol className="mt-3 flex gap-2" aria-label="Fortschritt">
            {STEPS.map((s, i) => (
              <li
                key={s}
                aria-current={i === step ? 'step' : undefined}
                className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-accent' : 'bg-border'}`}
              >
                <span className="sr-only">
                  {s} {i < step ? '(erledigt)' : i === step ? '(aktuell)' : ''}
                </span>
              </li>
            ))}
          </ol>
        </div>

        {step === 0 && (
          <div className="space-y-5">
            <UnofficialHint />
            <div>
              <label htmlFor="wizard-title-input" className="mb-1 block text-sm font-semibold">
                Name des Lernjournals
              </label>
              <input
                id="wizard-title-input"
                className="w-full rounded-sm border border-border-strong bg-surface px-3 py-2 text-sm"
                value={title}
                maxLength={120}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>
            <div>
              <p className="mb-1 text-sm font-semibold" id="location-label">
                Speicherort
              </p>
              <div className="flex items-center gap-2">
                <code
                  aria-labelledby="location-label"
                  className="min-w-0 flex-1 truncate rounded-sm border border-border bg-surface px-3 py-2 text-sm"
                  data-testid="wizard-location"
                >
                  {location || '–'}
                </code>
                <button
                  type="button"
                  onClick={() => void chooseFolder()}
                  className="shrink-0 rounded-sm border border-border-strong bg-surface px-3 py-2 text-sm hover:bg-hover"
                >
                  Anderen Ordner wählen …
                </button>
              </div>
              <p className="mt-1 text-xs text-ink-muted">
                Ein lokaler Ordner auf deinem Computer. Hier liegen Datenbank, Bilder und Sicherungen.
              </p>
            </div>
            {folderProblem && <ErrorMessage>{folderProblem}</ErrorMessage>}
            {folder?.syncProvider && <SyncWarning provider={folder.syncProvider} />}
          </div>
        )}

        {step === 1 && <ProfileFields value={profile} onChange={setProfile} />}

        {step === 2 && (
          <div className="space-y-3">
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={seed}
                onChange={(e) => setSeed(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-accent"
              />
              <span>
                <strong>Handlungskompetenzbereiche als Kategorien vorschlagen</strong>
                <span className="block text-ink-muted">
                  Aus dem Bildungsplan Medientechnologe/-in EFZ. Du kannst sie später umbenennen, löschen oder
                  eigene ergänzen – Zuordnungen sind immer freiwillig.
                </span>
              </span>
            </label>
            <ul className={`ml-7 list-none space-y-1 text-sm ${seed ? '' : 'text-ink-muted line-through'}`}>
              {BIPLA_CATEGORIES.map((c) => (
                <li key={c.code}>{c.name}</li>
              ))}
            </ul>
            <div className="border-t border-border-subtle pt-4">
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={reminderOptIn}
                  onChange={(e) => setReminderOptIn(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-accent"
                />
                <span>
                  <strong>Windows-Erinnerung für neue Journale aktivieren (optional)</strong>
                  <span className="block text-ink-muted">
                    Erinnert dich dezent mit einer Windows-Benachrichtigung («Neues Journal» / «Nicht jetzt»),
                    wenn längere Zeit kein Eintrag erfasst wurde. Du kannst das jederzeit in den Einstellungen
                    ändern.
                  </span>
                </span>
              </label>
              {reminderOptIn && (
                <div className="ml-7 mt-2 flex items-center gap-2 text-sm">
                  <label htmlFor="wizard-reminder-days">Erinnern nach</label>
                  <input
                    id="wizard-reminder-days"
                    type="number"
                    min={JOURNAL_REMINDER.minDays}
                    max={JOURNAL_REMINDER.maxDays}
                    value={reminderDays}
                    onChange={(e) => {
                      const v = e.target.valueAsNumber;
                      if (
                        Number.isInteger(v) &&
                        v >= JOURNAL_REMINDER.minDays &&
                        v <= JOURNAL_REMINDER.maxDays
                      )
                        setReminderDays(v);
                    }}
                    className="w-20 rounded-sm border border-border-strong bg-surface px-2.5 py-1"
                  />
                  <span>Tagen ohne neues Journal</span>
                </div>
              )}
            </div>
          </div>
        )}

        {actions.error && <ErrorMessage>{actions.error}</ErrorMessage>}

        <div className="flex items-center justify-between border-t border-border pt-4">
          <button
            type="button"
            onClick={() => (step === 0 ? dispatch({ type: 'closeWizard' }) : setStep(step - 1))}
            className="rounded-sm px-4 py-2 text-sm hover:bg-hover"
          >
            {step === 0 ? 'Abbrechen' : 'Zurück'}
          </button>
          <button
            type="submit"
            aria-disabled={!canContinue || actions.busy ? true : undefined}
            className={`rounded-sm px-5 py-2 text-sm font-semibold text-white ${
              canContinue && !actions.busy
                ? 'bg-action hover:bg-action-hover'
                : 'cursor-default bg-ink-disabled'
            }`}
          >
            {step < STEPS.length - 1 ? 'Weiter' : 'Lernjournal anlegen'}
          </button>
        </div>
      </form>
    </main>
  );
}
