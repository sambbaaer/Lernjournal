import {
  LEARNING_PLACES,
  LEARNING_PLACE_LABELS,
  type JournalMeta,
  type JournalSummary,
} from '@shared/journal';
import { computeSchoolYear } from '@shared/school-year';
import { JOURNAL_TEMPLATES } from '@shared/journal-templates';
import { useApp } from '../state/AppContext';
import { LinkFields } from './LinkFields';
import { TaxonomyFields } from './TaxonomyFields';

const field = 'rounded-sm border border-border-strong bg-surface px-2 py-1.5 text-sm';

export function JournalDetails({
  journal,
  meta,
  onChange,
  onCommit,
}: {
  journal: JournalSummary;
  meta: JournalMeta;
  onChange: (meta: JournalMeta) => void;
  onCommit: () => void;
}) {
  const { state } = useApp();
  const computed = computeSchoolYear(state.project?.profile.apprenticeshipStart ?? null, meta.workDate);
  return (
    <div
      id="journal-details"
      hidden={!state.journalDetailsOpen}
      className="mt-3 rounded-md border border-border bg-ribbon p-4"
    >
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-ink-muted">Arbeitsdatum</span>
          <input
            type="date"
            required
            value={meta.workDate}
            onChange={(e) => e.target.value && onChange({ ...meta, workDate: e.target.value })}
            onBlur={onCommit}
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-ink-muted">Lernort</span>
          <select
            value={meta.learningPlace}
            onChange={(e) =>
              onChange({ ...meta, learningPlace: e.target.value as JournalMeta['learningPlace'] })
            }
            className={field}
          >
            {LEARNING_PLACES.map((place) => (
              <option key={place} value={place}>
                {LEARNING_PLACE_LABELS[place]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-ink-muted">Lehrjahr</span>
          <select
            value={meta.schoolYearOverride ?? 'auto'}
            onChange={(e) =>
              onChange({
                ...meta,
                schoolYearOverride: e.target.value === 'auto' ? null : Number(e.target.value),
              })
            }
            className={field}
          >
            <option value="auto">
              {computed ? `Automatisch (${computed.year}. Lehrjahr)` : 'Automatisch (kein Lehrbeginn)'}
            </option>
            {[1, 2, 3, 4].map((year) => (
              <option key={year} value={year}>
                {year}. Lehrjahr
              </option>
            ))}
          </select>
        </label>
      </div>
      <TaxonomyFields journal={journal} />
      <LinkFields journalId={journal.id} />
      <p className="mt-3 text-xs text-ink-muted">
        Ausgangsvorlage · {JOURNAL_TEMPLATES[journal.template].label}
      </p>
    </div>
  );
}
