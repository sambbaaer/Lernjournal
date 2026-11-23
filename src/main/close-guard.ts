// Sicheres Schliessen des Fensters (SPEC: «ausstehende Änderungen bei
// Navigation/Schliessen flushen»).
//
// Ablauf:
//  1. Nutzer schliesst das Fenster → Schliessen wird zunächst angehalten.
//  2. Hauptprozess bittet die Oberfläche, alles Ausstehende zu speichern.
//  3. Oberfläche meldet zurück: gespeichert (true) oder fehlgeschlagen (false).
//  4. true → Fenster schliesst. false → Rückfrage «Ohne Speichern schliessen?».
//  5. Antwortet die Oberfläche nicht (abgestürzt/hängt), schliesst das Fenster
//     nach einer Frist trotzdem – speichern könnte sie ohnehin nicht mehr.
// Ohne Electron-Abhängigkeit, damit die Logik mit Vitest prüfbar ist.

export type CloseGuardDeps = {
  requestFlush: () => void; // Nachricht an die Oberfläche senden
  confirmCloseUnsaved: () => Promise<boolean>; // Rückfrage; true = trotzdem schliessen
  close: () => void; // Fenster wirklich schliessen
  timeoutMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (t: unknown) => void;
};

export function createCloseGuard(deps: CloseGuardDeps) {
  const timeoutMs = deps.timeoutMs ?? 5000;
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((t) => clearTimeout(t as ReturnType<typeof setTimeout>));
  let allowed = false; // Schliessen freigegeben
  let waiting = false; // wartet auf Antwort der Oberfläche
  let timer: unknown = null;

  function finish() {
    allowed = true;
    waiting = false;
    deps.close();
  }

  return {
    // Vom 'close'-Ereignis des Fensters aufrufen. Rückgabe true = Schliessen anhalten.
    onCloseRequested(): boolean {
      if (allowed) return false;
      if (!waiting) {
        waiting = true;
        deps.requestFlush();
        timer = setTimer(finish, timeoutMs);
      }
      return true;
    },
    // Antwort der Oberfläche
    async onFlushResult(saved: boolean): Promise<void> {
      if (!waiting) return;
      if (timer) clearTimer(timer);
      timer = null;
      if (saved) return finish();
      waiting = false;
      if (await deps.confirmCloseUnsaved()) finish();
    },
    // Für Spezialfälle (Rauchtest, Absturz der Oberfläche): ohne Rückfrage schliessen
    allowClose(): void {
      allowed = true;
    },
  };
}
