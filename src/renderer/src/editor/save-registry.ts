// «Jetzt speichern»: Die Dokumentansicht meldet hier ihre Speicherfunktion an.
// Genutzt von Strg+S, «Erneut versuchen», Projektwechsel und vor dem Schliessen
// des Fensters. Ergebnis: true = alles gespeichert (oder nichts ausstehend).
let current: (() => Promise<boolean>) | null = null;
const unmountSaves = new Set<Promise<boolean>>();

export function registerSaveNow(fn: (() => Promise<boolean>) | null): void {
  current = fn;
}

export function saveNow(): Promise<boolean> | null {
  return current ? current() : null;
}

export function saveOnUnmount(flush: () => Promise<boolean>): void {
  const running = flush();
  unmountSaves.add(running);
  const remove = () => {
    unmountSaves.delete(running);
  };
  void running.then(remove, remove);
}

// Für Projektwechsel/Schliessen: wartet auf das Speichern, falls ein Journal offen ist
export async function saveIfNeeded(): Promise<boolean> {
  const saves = [...unmountSaves];
  const active = saveNow();
  if (active) saves.push(active);
  return (await Promise.all(saves)).every(Boolean);
}
