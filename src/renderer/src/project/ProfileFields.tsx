// Profilfelder: im Assistenten und in den Einstellungen gleich.
// Alles freiwillig ausser der Fachrichtung (Standard «Print»).
import { useId } from 'react';
import { SPECIALIZATIONS, SPECIALIZATION_LABELS, type Profile } from '@shared/ipc';

const input = 'w-full rounded-sm border border-border-strong bg-surface px-3 py-2 text-sm';

export function ProfileFields({ value, onChange }: { value: Profile; onChange: (p: Profile) => void }) {
  const id = useId();
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor={`${id}-name`} className="mb-1 block text-sm font-semibold">
          Dein Name
        </label>
        <input
          id={`${id}-name`}
          className={input}
          value={value.displayName}
          maxLength={100}
          autoComplete="name"
          onChange={(e) => onChange({ ...value, displayName: e.target.value })}
        />
        <p className="mt-1 text-xs text-ink-muted">Erscheint auf Word-Exporten.</p>
      </div>
      <div>
        <label htmlFor={`${id}-company`} className="mb-1 block text-sm font-semibold">
          Lehrbetrieb <span className="font-normal text-ink-muted">(freiwillig)</span>
        </label>
        <input
          id={`${id}-company`}
          className={input}
          value={value.company ?? ''}
          maxLength={150}
          onChange={(e) => onChange({ ...value, company: e.target.value || null })}
        />
      </div>
      <div>
        <label htmlFor={`${id}-start`} className="mb-1 block text-sm font-semibold">
          Lehrbeginn <span className="font-normal text-ink-muted">(freiwillig)</span>
        </label>
        <input
          id={`${id}-start`}
          type="date"
          className={`${input} max-w-48`}
          value={value.apprenticeshipStart ?? ''}
          onChange={(e) => onChange({ ...value, apprenticeshipStart: e.target.value || null })}
          aria-describedby={`${id}-start-hint`}
        />
        <p id={`${id}-start-hint`} className="mt-1 text-xs text-ink-muted">
          Damit berechnet Lernjournal das Lehrjahr deiner Journale automatisch.
        </p>
      </div>
      <fieldset>
        <legend className="mb-1 text-sm font-semibold">Fachrichtung</legend>
        <div className="flex flex-wrap gap-4">
          {SPECIALIZATIONS.map((s) => (
            <label key={s} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={`${id}-spec`}
                value={s}
                checked={value.specialization === s}
                onChange={() => onChange({ ...value, specialization: s })}
                className="h-4 w-4 accent-accent"
              />
              {SPECIALIZATION_LABELS[s]}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
