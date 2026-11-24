// Opt-in Erinnerung für ein neues Journal (Standard: alle 30 Tage).
// Erscheint dezent unter dem Menüband UND löst einmal pro Fälligkeit eine
// echte Windows-11-Toast-Benachrichtigung mit den Aktionen «Neues Journal»
// und «Nicht jetzt» aus.
import { useEffect, useRef, useState } from 'react';
import { BellRing } from 'lucide-react';
import { JOURNAL_REMINDER, journalReminder, journalReminderText } from '@shared/backup';
import { createJournal } from '../journal/actions';
import { formatDateTime } from '../project/messages';
import { useApp } from '../state/AppContext';

const DAY_MS = 24 * 60 * 60 * 1000;

export function JournalReminderBar() {
  const { state, dispatch } = useApp();
  const [now, setNow] = useState(() => new Date());
  const notifiedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  // Neuestes Journal-Datum (Arbeitsdatum oder Erstellungs-/Änderungszeitpunkt)
  const latestJournalAt =
    state.journals.length > 0
      ? state.journals.reduce<string>((max, j) => {
          const workIso = `${j.workDate}T12:00:00.000Z`;
          const candidate = j.updatedAt > workIso ? j.updatedAt : workIso;
          return candidate > max ? candidate : max;
        }, '')
      : null;

  const project = state.project;
  const reminder =
    project && state.journalsLoaded
      ? journalReminder({
          enabled: state.journalReminderEnabled,
          intervalDays: state.journalReminderDays,
          lastJournalAt: latestJournalAt,
          projectCreatedAt: project.createdAt,
          snoozedUntil: state.journalReminderSnoozedUntil,
          now,
        })
      : { due: false as const };

  const text = reminder.due ? journalReminderText(reminder) : null;

  // Einmal pro Sitzung/Projektstand echte Windows-Benachrichtigung senden
  useEffect(() => {
    if (!reminder.due || !text || !project) return;
    const key = `${project.id}|${latestJournalAt ?? 'none'}|${state.journalReminderSnoozedUntil ?? 'none'}`;
    if (notifiedKeyRef.current === key) return;
    notifiedKeyRef.current = key;
    void window.lernjournal.app.notifyJournalReminder({ body: text }).catch(() => null);
  }, [reminder.due, text, project, latestJournalAt, state.journalReminderSnoozedUntil]);

  // Klick auf «Neues Journal» oder «Nicht jetzt» direkt im Windows-11-Toast
  useEffect(() => {
    return window.lernjournal.app.onReminderAction((action) => {
      if (action === 'new-journal') {
        void createJournal(dispatch);
      } else if (action === 'snooze') {
        const until = new Date(Date.now() + JOURNAL_REMINDER.snoozeDays * DAY_MS).toISOString();
        dispatch({ type: 'setJournalReminder', snoozedUntil: until });
        dispatch({
          type: 'notice',
          text: `Erinnerung aufgeschoben bis ${formatDateTime(until)}.`,
        });
      }
    });
  }, [dispatch]);

  if (!reminder.due || !text) return null;

  function snooze() {
    const until = new Date(Date.now() + JOURNAL_REMINDER.snoozeDays * DAY_MS).toISOString();
    dispatch({ type: 'setJournalReminder', snoozedUntil: until });
    dispatch({
      type: 'notice',
      text: `Erinnerung aufgeschoben bis ${formatDateTime(until)}.`,
    });
  }

  return (
    <div
      role="region"
      aria-label="Erinnerung: Neues Journal"
      className="flex flex-wrap items-center gap-3 border-l-4 border-accent bg-selected px-4 py-2 text-sm"
    >
      <BellRing aria-hidden="true" size={18} className="shrink-0 text-accent-strong" />
      <p className="min-w-0 flex-1" data-testid="journal-reminder">
        {text}
      </p>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={() => void createJournal(dispatch)}
          className="rounded-sm bg-action px-3 py-1.5 font-semibold text-white hover:bg-action-hover"
        >
          Neues Journal
        </button>
        <button type="button" onClick={snooze} className="rounded-sm px-3 py-1.5 hover:bg-hover">
          Nicht jetzt
        </button>
      </div>
    </div>
  );
}
