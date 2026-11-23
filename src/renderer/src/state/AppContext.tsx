// Stellt Zustand und dispatch allen Komponenten zur Verfügung.
import { createContext, useContext, useReducer, type ReactNode } from 'react';
import { initialState, reducer, type Action, type AppState } from './app-state';

type Ctx = { state: AppState; dispatch: (a: Action) => void };
const AppContext = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>;
}

export function useApp(): Ctx {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp() ausserhalb von <AppProvider> verwendet');
  return ctx;
}
