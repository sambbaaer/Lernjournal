// «Jetzt speichern»: Die Dokumentansicht meldet hier ihre Speicherfunktion an.
// Genutzt von Strg+S, «Erneut versuchen», Projektwechsel und vor dem Schliessen
// des Fensters. Ergebnis: true = alles gespeichert (oder nichts ausstehend).
let current: (() => Promise<boolean>) | null = null;

export function registerSaveNow(fn: (() => Promise<boolean>) | null): void {
  current = fn;
}

export function saveNow(): Promise<boolean> | null {
  return current ? current() : null;
}

// Für Projektwechsel/Schliessen: wartet auf das Speichern, falls ein Journal offen ist
export async function saveIfNeeded(): Promise<boolean> {
  const p = saveNow();
  return p ? p : true;
}
