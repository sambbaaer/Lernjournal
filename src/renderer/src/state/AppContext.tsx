// Stellt Zustand und dispatch allen Komponenten zur Verfügung.
import { createContext, useContext, useLayoutEffect, useReducer, type ReactNode } from 'react';
import { COLLECTION_LIMITS } from '@shared/export';
import { initialState, reducer, type Action, type AppState } from './app-state';

type Ctx = { state: AppState; dispatch: (a: Action) => void };
const AppContext = createContext<Ctx | null>(null);

const PREFERENCES_KEY = 'lernjournal.preferences';

function withPreferences(state: AppState): AppState {
  try {
    const stored = JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? '{}');
    const appearance = stored.appearance;
    const qvMinimum = stored.qvMinimum;
    return {
      ...state,
      appearance: appearance === 'dark' || appearance === 'system' ? appearance : state.appearance,
      qvMinimum:
        Number.isInteger(qvMinimum) && qvMinimum >= 1 && qvMinimum <= COLLECTION_LIMITS.maxJournals
          ? qvMinimum
          : state.qvMinimum,
    };
  } catch {
    return state;
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState, withPreferences);
  const { appearance, qvMinimum } = state;
  useLayoutEffect(() => {
    document.documentElement.dataset['theme'] = appearance;
    try {
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ appearance, qvMinimum }));
    } catch {
      // Die Einstellung gilt auch ohne verfügbaren lokalen Browser-Speicher in dieser Sitzung.
    }
  }, [appearance, qvMinimum]);
  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>;
}

export function useApp(): Ctx {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp() ausserhalb von <AppProvider> verwendet');
  return ctx;
}
