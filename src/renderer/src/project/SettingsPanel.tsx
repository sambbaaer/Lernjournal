// Einstellungen: Profil bearbeiten, Kategorien/Schlagwörter verwalten,
// Suchindex neu aufbauen, Sicherungen (AJ-15), Speicherort anzeigen, Projekt schliessen.
import { useState, type FormEvent } from 'react';
import type { Profile } from '@shared/ipc';
import { BackupSection } from '../backup/BackupSection';
import { useApp } from '../state/AppContext';
import { journalCounts } from '../state/app-state';
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
