// Sicherer Rahmen für alle IPC-Befehle.
//
// Jeder eingehende Aufruf durchläuft drei Prüfungen, BEVOR die eigentliche
// Funktion läuft:
//   1. Kommt er von unserer eigenen Oberfläche (nicht von fremden Inhalten)?
//   2. Ist der Kanal im Vertrag (src/shared/ipc.ts) bekannt?
//   3. Passen die Daten exakt zum zod-Schema?
// Diese Datei importiert absichtlich nichts aus «electron», damit sie ohne
// Electron getestet werden kann (siehe ipc-handler.test.ts).
import { ipcContract, type IpcChannel, type IpcRequest, type IpcResponse, type IpcResult } from '@shared/ipc';

// Minimal das, was wir vom Electron-Event brauchen: die URL des aufrufenden Frames.
export type SenderInfo = { senderFrame?: { url: string } | null };

export type Handlers = {
  [C in IpcChannel]: (req: IpcRequest<C>) => Promise<IpcResponse<C>> | IpcResponse<C>;
};

export function createIpcDispatcher(handlers: Handlers, isTrustedUrl: (url: string) => boolean) {
  return async function dispatch(
    channel: string,
    event: SenderInfo,
    raw: unknown,
  ): Promise<IpcResult<unknown>> {
    // 1) Absender prüfen. senderFrame kann fehlen, wenn der Frame inzwischen weg ist.
    const url = event.senderFrame?.url ?? '';
    if (!isTrustedUrl(url)) {
      return {
        ok: false,
        error: { code: 'FORBIDDEN', message: 'Aufruf von nicht vertrauenswürdiger Quelle' },
      };
    }
    // 2) Kanal prüfen (Object.hasOwn verhindert Tricks wie «__proto__»)
    if (!Object.hasOwn(ipcContract, channel)) {
      return { ok: false, error: { code: 'UNKNOWN_CHANNEL', message: `Unbekannter Befehl: ${channel}` } };
    }
    const c = channel as IpcChannel;
    // 3) Daten prüfen
    const parsed = ipcContract[c].request.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: { code: 'INVALID_REQUEST', message: 'Ungültige Daten' } };
    }
    try {
      const data = await handlers[c](parsed.data as never);
      return { ok: true, data };
    } catch (err) {
      // Details nur ins lokale Protokoll, nicht an die Oberfläche
      console.error(`[ipc] Fehler in ${c}:`, err);
      return { ok: false, error: { code: 'INTERNAL', message: 'Interner Fehler' } };
    }
  };
}
