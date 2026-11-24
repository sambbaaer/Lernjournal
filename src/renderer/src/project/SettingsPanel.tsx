// Einstellungen: Profil bearbeiten, Kategorien/Schlagwörter verwalten,
// Suchindex neu aufbauen, Sicherungen (AJ-15), Speicherort anzeigen, Projekt schliessen.
import { useState, type FormEvent } from 'react';
import { JOURNAL_REMINDER } from '@shared/backup';
import { COLLECTION_LIMITS } from '@shared/export';
import type { Profile } from '@shared/ipc';
import { BackupSection } from '../backup/BackupSection';
import { useApp } from '../state/AppContext';
import { journalCounts } from '../state/app-state';
import type { Appearance } from '../state/app-state';
import { ErrorMessage, SyncWarning } from './Notices';
import { ProfileFields } from './ProfileFields';
import { TaxonomyManager } from './TaxonomyManager';
import { useProjectActions } from './useProjectActions';

export function SettingsPanel() {
  const { state, dispatch } = useApp();
  const project = state.project!;
  const counts = journalCounts(state);
  const [profile, setProfile] = useState<Profile>(project.profile);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const actions = useProjectActions();
  const dirty = JSON.stringify(profile) !== JSON.stringify(project.profile);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!dirty) return;
    setSaving(true);
    setError(null);
    const res = await window.lernjournal.profile.update(profile);
    setSaving(false);
    if (!res.ok) return setError('Profil konnte nicht gespeichert werden.');
    dispatch({ type: 'profileUpdated', profile: res.data });
    setProfile(res.data);
    // Nur nach bestätigter Speicherung melden (SPEC)
    dispatch({ type: 'notice', text: 'Profil gespeichert.' });
  }

  return (
    <div className="space-y-8">
      <section aria-labelledby="settings-appearance" className="max-w-xl space-y-3">
        <h2 id="settings-appearance" className="text-lg font-semibold">
          Darstellung und QV
        </h2>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex flex-col gap-1">
            Farbschema
            <select
              value={state.appearance}
              onChange={(e) => dispatch({ type: 'setAppearance', appearance: e.target.value as Appearance })}
              className="rounded-sm border border-border-strong bg-surface px-3 py-2"
            >
              <option value="light">Hell</option>
              <option value="dark">Dunkel</option>
              <option value="system">Systemeinstellung</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Mindestanzahl Journale für das QV
            <input
              type="number"
              min={1}
              max={COLLECTION_LIMITS.maxJournals}
              defaultValue={state.qvMinimum}
              onBlur={(e) => {
                const count = e.target.valueAsNumber;
                if (e.target.validity.valid && Number.isInteger(count))
                  dispatch({ type: 'setQvMinimum', minimum: count });
                else e.target.value = String(state.qvMinimum);
              }}
              className="w-24 rounded-sm border border-border-strong bg-surface px-3 py-2"
            />
          </label>
        </div>
        <div className="space-y-2 border-t border-border-subtle pt-3 text-sm">
          <label className="flex items-start gap-2.5">
            <input
              type="checkbox"
              checked={state.journalReminderEnabled}
              onChange={(e) =>
                dispatch({
                  type: 'setJournalReminder',
                  enabled: e.target.checked,
                  snoozedUntil: null,
                })
              }
              className="mt-0.5 h-4 w-4 accent-accent"
            />
            <span>
              <span className="font-medium">Windows-Erinnerung für neue Journale</span>
              <span className="block text-ink-muted">
                Zeigt eine dezente Windows-Benachrichtigung («Neues Journal» / «Nicht jetzt»), wenn längere
                Zeit kein Auftrag festgehalten wurde.
              </span>
            </span>
          </label>
          {state.journalReminderEnabled && (
            <div className="ml-6 flex flex-wrap items-center gap-2">
              <label htmlFor="settings-reminder-days">Erinnerungsabstand (Tage)</label>
              <input
                id="settings-reminder-days"
                type="number"
                min={JOURNAL_REMINDER.minDays}
                max={JOURNAL_REMINDER.maxDays}
                defaultValue={state.journalReminderDays}
                onBlur={(e) => {
                  const days = e.target.valueAsNumber;
                  if (
                    e.target.validity.valid &&
                    Number.isInteger(days) &&
                    days >= JOURNAL_REMINDER.minDays &&
                    days <= JOURNAL_REMINDER.maxDays
                  )
                    dispatch({ type: 'setJournalReminder', days });
                  else e.target.value = String(state.journalReminderDays);
                }}
                className="w-20 rounded-sm border border-border-strong bg-surface px-2.5 py-1.5"
              />
            </div>
          )}
        </div>
      </section>
      <section aria-labelledby="settings-profile" className="max-w-xl">
        <h2 id="settings-profile" className="mb-3 text-lg font-semibold">
          Profil
        </h2>
        <form onSubmit={save} className="space-y-4">
          <ProfileFields value={profile} onChange={setProfile} />
          {error && <ErrorMessage>{error}</ErrorMessage>}
          <button
            type="submit"
            aria-disabled={!dirty || saving ? true : undefined}
            className={`rounded-sm px-4 py-2 text-sm font-semibold text-white ${
              dirty && !saving ? 'bg-action hover:bg-action-hover' : 'cursor-default bg-ink-disabled'
            }`}
          >
            {saving ? 'Speichert …' : 'Profil speichern'}
          </button>
        </form>
      </section>

      <TaxonomyManager />

      <SearchIndexSection />

      <BackupSection />

      <section aria-labelledby="settings-location" className="max-w-2xl space-y-3">
        <h2 id="settings-location" className="text-lg font-semibold">
          Projekt
        </h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-ink-muted">Name</dt>
          <dd>{project.title}</dd>
          <dt className="text-ink-muted">Speicherort</dt>
          <dd className="break-all" data-testid="project-path">
            {project.path}
          </dd>
          <dt className="text-ink-muted">Journale</dt>
          <dd data-testid="journal-count">
            {counts.total}
            {counts.archived > 0 && ` (davon ${counts.archived} archiviert)`}
          </dd>
        </dl>
        {project.syncProvider && <SyncWarning provider={project.syncProvider} />}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void window.lernjournal.project.showFolder()}
            className="rounded-sm border border-border-strong bg-surface px-4 py-2 text-sm hover:bg-hover"
          >
            Im Explorer öffnen
          </button>
          <button
            type="button"
            onClick={() => void actions.close()}
            className="rounded-sm border border-border-strong bg-surface px-4 py-2 text-sm hover:bg-hover"
          >
            Projekt schliessen
          </button>
        </div>
      </section>
    </div>
  );
}

// «Suchindex neu aufbauen» (AJ-11, SPEC «Suche»). Der Index wird sonst
// automatisch nachgeführt und beim Öffnen geprüft; der Knopf ist die
// Notlösung, falls die Suche trotzdem einmal etwas nicht findet.
function SearchIndexSection() {
  const { dispatch } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function rebuild() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await window.lernjournal.search.rebuild().catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError('Suchindex konnte nicht neu aufgebaut werden.');
    const n = res.data.journals;
    dispatch({ type: 'notice', text: `Suchindex neu aufgebaut (${n} ${n === 1 ? 'Journal' : 'Journale'}).` });
  }

  return (
    <section aria-labelledby="settings-search" className="max-w-2xl space-y-3">
      <h2 id="settings-search" className="text-lg font-semibold">
        Suche
      </h2>
      <p className="text-sm text-ink-muted">
        Die Fachbuch-Suche wird automatisch aktuell gehalten. Findet sie ein Journal nicht, obwohl der Begriff
        darin steht, hilft es, den Suchindex neu aufzubauen. Deine Journale werden dabei nicht verändert.
      </p>
      {error && <ErrorMessage>{error}</ErrorMessage>}
      <button
        type="button"
        onClick={() => void rebuild()}
        aria-disabled={busy || undefined}
        className="rounded-sm border border-border-strong bg-surface px-4 py-2 text-sm hover:bg-hover"
      >
        {busy ? 'Baut neu auf …' : 'Suchindex neu aufbauen'}
      </button>
    </section>
  );
}
