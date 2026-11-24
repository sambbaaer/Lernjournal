// Stellt Zustand und dispatch allen Komponenten zur Verfügung.
import { createContext, useContext, useLayoutEffect, useReducer, type ReactNode } from 'react';
import { JOURNAL_REMINDER } from '@shared/backup';
import { COLLECTION_LIMITS } from '@shared/export';
import { initialState, reducer, ZOOM_STEPS, type Action, type AppState } from './app-state';

type Ctx = { state: AppState; dispatch: (a: Action) => void };
const AppContext = createContext<Ctx | null>(null);

const PREFERENCES_KEY = 'lernjournal.preferences';

function withPreferences(state: AppState): AppState {
  try {
    const stored = JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? '{}');
    const appearance = stored.appearance;
    const qvMinimum = stored.qvMinimum;
    const zoomPercent = stored.zoomPercent;
    const journalReminderEnabled = stored.journalReminderEnabled;
    const journalReminderDays = stored.journalReminderDays;
    const journalReminderSnoozedUntil = stored.journalReminderSnoozedUntil;
    return {
      ...state,
      appearance: appearance === 'dark' || appearance === 'system' ? appearance : state.appearance,
      qvMinimum:
        Number.isInteger(qvMinimum) && qvMinimum >= 1 && qvMinimum <= COLLECTION_LIMITS.maxJournals
          ? qvMinimum
          : state.qvMinimum,
      zoomPercent:
        typeof zoomPercent === 'number' && ZOOM_STEPS.includes(zoomPercent as (typeof ZOOM_STEPS)[number])
          ? zoomPercent
          : state.zoomPercent,
      journalReminderEnabled:
        typeof journalReminderEnabled === 'boolean' ? journalReminderEnabled : state.journalReminderEnabled,
      journalReminderDays:
        Number.isInteger(journalReminderDays) &&
        journalReminderDays >= JOURNAL_REMINDER.minDays &&
        journalReminderDays <= JOURNAL_REMINDER.maxDays
          ? journalReminderDays
          : state.journalReminderDays,
      journalReminderSnoozedUntil:
        typeof journalReminderSnoozedUntil === 'string' ? journalReminderSnoozedUntil : null,
    };
  } catch {
    return state;
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState, withPreferences);
  const {
    appearance,
    qvMinimum,
    zoomPercent,
    journalReminderEnabled,
    journalReminderDays,
    journalReminderSnoozedUntil,
  } = state;
  useLayoutEffect(() => {
    document.documentElement.dataset['theme'] = appearance;
    try {
      localStorage.setItem(
        PREFERENCES_KEY,
        JSON.stringify({
          appearance,
          qvMinimum,
          zoomPercent,
          journalReminderEnabled,
          journalReminderDays,
          journalReminderSnoozedUntil,
        }),
      );
    } catch {
      // Die Einstellung gilt auch ohne verfügbaren lokalen Browser-Speicher in dieser Sitzung.
    }
  }, [
    appearance,
    qvMinimum,
    zoomPercent,
    journalReminderEnabled,
    journalReminderDays,
    journalReminderSnoozedUntil,
  ]);
  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>;
}

export function useApp(): Ctx {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp() ausserhalb von <AppProvider> verwendet');
  return ctx;
}
