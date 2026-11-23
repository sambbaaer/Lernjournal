// Projekt öffnen/anlegen/schliessen inkl. Rückfrage bei gesperrten Projekten.
// Von Startbildschirm, Assistent, Datei-Menü und Einstellungen gemeinsam genutzt.
import { useCallback, useState } from 'react';
import type { OpenResult, Profile } from '@shared/ipc';
import { useApp } from '../state/AppContext';
import { openResultMessage } from './messages';

export type Pending = { path: string; message: string } | null;

export function useProjectActions() {
  const { dispatch } = useApp();
  const [error, setError] = useState<string | null>(null);
  // Projekt auf anderem PC geöffnet → Nutzer entscheidet, ob trotzdem öffnen
  const [confirmForce, setConfirmForce] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);

  const handle = useCallback(
    (r: OpenResult, path: string) => {
      if (r.status === 'opened') {
        setError(null);
        setConfirmForce(null);
        dispatch({ type: 'projectOpened', project: r.project });
      } else if (r.status === 'locked-elsewhere') {
        setConfirmForce({ path, message: openResultMessage(r) ?? '' });
      } else {
        setError(openResultMessage(r));
      }
    },
    [dispatch],
  );

  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch {
      setError('Unerwarteter Fehler. Bitte erneut versuchen.');
    } finally {
      setBusy(false);
    }
  }, []);

  const open = useCallback(
    (path: string, force = false) =>
      run(async () => {
        const res = await window.lernjournal.project.open({ path, force });
        if (!res.ok) return setError(res.error.message);
        handle(res.data, path);
      }),
    [run, handle],
  );

  const chooseAndOpen = useCallback(
    () =>
      run(async () => {
        const res = await window.lernjournal.project.chooseFolder({ purpose: 'open' });
        if (!res.ok || !res.data.path) return;
        const path = res.data.path;
        const opened = await window.lernjournal.project.open({ path });
        if (!opened.ok) return setError(opened.error.message);
        handle(opened.data, path);
      }),
    [run, handle],
  );

  const create = useCallback(
    (input: { path: string; title: string; profile: Profile; seedCategories: boolean }) =>
      run(async () => {
        const res = await window.lernjournal.project.create(input);
        if (!res.ok) return setError(res.error.message);
        handle(res.data, input.path);
      }),
    [run, handle],
  );

  const close = useCallback(
    () =>
      run(async () => {
        await window.lernjournal.project.close();
        dispatch({ type: 'projectClosed' });
      }),
    [run, dispatch],
  );

  return { open, chooseAndOpen, create, close, error, setError, confirmForce, setConfirmForce, busy };
}
