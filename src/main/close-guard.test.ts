import { describe, expect, it, vi } from 'vitest';
import { createCloseGuard } from './close-guard';

function setup(confirm = false) {
  const timers: (() => void)[] = [];
  const deps = {
    requestFlush: vi.fn(),
    confirmCloseUnsaved: vi.fn(async () => confirm),
    close: vi.fn(),
    setTimer: (fn: () => void) => {
      timers.push(fn);
      return timers.length;
    },
    clearTimer: vi.fn(),
  };
  return { guard: createCloseGuard(deps), deps, fireTimeout: () => timers.at(-1)?.() };
}

describe('Sicheres Schliessen', () => {
  it('hält das Schliessen an, bis die Oberfläche gespeichert hat', async () => {
    const { guard, deps } = setup();
    expect(guard.onCloseRequested()).toBe(true);
    expect(deps.requestFlush).toHaveBeenCalledOnce();
    expect(deps.close).not.toHaveBeenCalled();
    await guard.onFlushResult(true);
    expect(deps.close).toHaveBeenCalledOnce();
    // Das daraus folgende 'close'-Ereignis wird durchgelassen
    expect(guard.onCloseRequested()).toBe(false);
  });

  it('mehrfaches Schliessen fragt die Oberfläche nur einmal', () => {
    const { guard, deps } = setup();
    guard.onCloseRequested();
    guard.onCloseRequested();
    expect(deps.requestFlush).toHaveBeenCalledOnce();
  });

  it('Speichern fehlgeschlagen: Rückfrage; «Abbrechen» lässt das Fenster offen', async () => {
    const { guard, deps } = setup(false);
    guard.onCloseRequested();
    await guard.onFlushResult(false);
    expect(deps.confirmCloseUnsaved).toHaveBeenCalledOnce();
    expect(deps.close).not.toHaveBeenCalled();
    // Später erneut schliessen → erneut speichern versuchen
    expect(guard.onCloseRequested()).toBe(true);
    expect(deps.requestFlush).toHaveBeenCalledTimes(2);
  });

  it('Speichern fehlgeschlagen: «Ohne Speichern schliessen» schliesst', async () => {
    const { guard, deps } = setup(true);
    guard.onCloseRequested();
    await guard.onFlushResult(false);
    expect(deps.close).toHaveBeenCalledOnce();
  });

  it('Oberfläche antwortet nicht: schliesst nach Frist trotzdem', () => {
    const { guard, deps, fireTimeout } = setup();
    guard.onCloseRequested();
    fireTimeout();
    expect(deps.close).toHaveBeenCalledOnce();
  });

  it('verspätete Antwort nach Frist wird ignoriert', async () => {
    const { guard, deps, fireTimeout } = setup();
    guard.onCloseRequested();
    fireTimeout();
    await guard.onFlushResult(false);
    expect(deps.confirmCloseUnsaved).not.toHaveBeenCalled();
  });
});
