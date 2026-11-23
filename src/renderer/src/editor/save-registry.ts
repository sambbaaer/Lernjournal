// Strg+S soll ausstehende Änderungen sofort speichern. Die Dokumentansicht
// meldet hier ihre «Jetzt speichern»-Funktion an; der Befehl ruft sie auf.
let current: (() => Promise<void>) | null = null;

export function registerSaveNow(fn: (() => Promise<void>) | null): void {
  current = fn;
}

export function saveNow(): Promise<void> | null {
  return current ? current() : null;
}
