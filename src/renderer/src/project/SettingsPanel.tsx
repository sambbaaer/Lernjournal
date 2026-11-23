// Einstellungen: Profil bearbeiten, Speicherort anzeigen, Projekt schliessen.
import { useState, type FormEvent } from 'react';
import type { Profile } from '@shared/ipc';
import { useApp } from '../state/AppContext';
import { ErrorMessage, SyncWarning } from './Notices';
import { ProfileFields } from './ProfileFields';
import { useProjectActions } from './useProjectActions';

export function SettingsPanel() {
  const { state, dispatch } = useApp();
  const project = state.project!;
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
              dirty && !saving ? 'bg-accent hover:bg-accent-strong' : 'cursor-default bg-ink-disabled'
            }`}
          >
            {saving ? 'Speichert …' : 'Profil speichern'}
          </button>
        </form>
      </section>

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
          <dd>{project.journalCount}</dd>
        </dl>
        {project.syncProvider && <SyncWarning provider={project.syncProvider} />}
        <button
          type="button"
          onClick={() => void actions.close()}
          className="rounded-sm border border-border-strong bg-surface px-4 py-2 text-sm hover:bg-hover"
        >
          Projekt schliessen
        </button>
      </section>
    </div>
  );
}
