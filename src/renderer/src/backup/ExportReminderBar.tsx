// Infoleiste «Kopie ausserhalb des Computers» (AJ-15, SPEC: Erinnerung, wenn
// seit 30 Tagen kein .ajournal-Export erfolgt ist). Nicht blockierend, wie
// die Infoleisten in Office: Sie steht unter dem Menüband, führt mit einem
// Klick zu «Projekt übergeben» und lässt sich mit «Später erinnern» für
// EXPORT_REMINDER.snoozeDays ausblenden. Ob sie fällig ist, entscheidet die
// reine Funktion exportReminder() (Grenzfälle in src/shared/backup.test.ts).
import { useEffect, useState } from 'react';
import { HardDriveUpload } from 'lucide-react';
import { exportReminder, exportReminderText } from '@shared/backup';
import { formatDateTime } from '../project/messages';
import { useApp } from '../state/AppContext';
import { journalCounts } from '../state/app-state';
import { snoozeExportReminder } from './backup-actions';

// Aktuelle Zeit, stündlich nachgeführt – die Leiste erscheint auch, wenn das
// Programm über die Frist hinaus offen bleibt
function useNow(everyMs: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}

export function ExportReminderBar() {
  const { state, dispatch } = useApp();
  const now = useNow(60 * 60 * 1000);
  const [busy, setBusy] = useState(false);
  const project = state.project;
  if (!project || !state.journalsLoaded) return null;
  const reminder = exportReminder({
    lastExportAt: project.lastExportAt,
    snoozedUntil: project.exportReminderUntil,
    projectCreatedAt: project.createdAt,
    journalCount: journalCounts(state).total,
    now,
  });
  if (!reminder.due) return null;

  async function snooze() {
    if (busy) return;
    setBusy(true);
    const until = await snoozeExportReminder();
    setBusy(false);
    if (!until) return dispatch({ type: 'notice', text: 'Die Erinnerung konnte nicht ausgeblendet werden.' });
    dispatch({ type: 'exportReminderSnoozed', until });
    dispatch({ type: 'notice', text: `Erinnerung ausgeblendet bis ${formatDateTime(until)}.` });
  }

  return (
    <div
      role="region"
      aria-label="Erinnerung: Kopie ausserhalb des Computers"
      className="flex flex-wrap items-center gap-3 border-l-4 border-warning bg-warning-bg px-4 py-2 text-sm"
    >
      <HardDriveUpload aria-hidden="true" size={18} className="shrink-0" />
      <p className="min-w-0 flex-1" data-testid="export-reminder">
        {exportReminderText(reminder)}
      </p>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={() => dispatch({ type: 'openArchive', mode: 'export' })}
          className="rounded-sm border border-border-strong bg-surface px-3 py-1.5 font-semibold hover:bg-hover"
        >
          Projekt übergeben …
        </button>
        <button
          type="button"
          onClick={() => void snooze()}
          aria-disabled={busy || undefined}
          className="rounded-sm px-3 py-1.5 hover:bg-hover"
        >
          Später erinnern
        </button>
      </div>
    </div>
  );
}
