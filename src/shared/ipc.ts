// IPC-Vertrag: die EINZIGE Liste von Befehlen, die die Oberfläche (Renderer)
// beim Hauptprozess auslösen darf.
//
// Warum so streng? Der Renderer zeigt Inhalte an, die Lernende eintippen oder
// einfügen. Falls dort je Schadcode landet, soll er nichts anderes tun können
// als diese wenigen, geprüften Befehle aufrufen (SPEC «Sicherheit»).
//
// Für jeden Kanal definieren wir mit zod:
//   request  – was der Renderer schicken darf (wird im Hauptprozess geprüft)
//   response – was zurückkommt (Typ für den Renderer)
import { z } from 'zod';

export const AppInfoSchema = z.object({
  name: z.string(),
  version: z.string(),
  platform: z.string(),
  versions: z.object({ electron: z.string(), chrome: z.string(), node: z.string() }),
});
export type AppInfo = z.infer<typeof AppInfoSchema>;

export const ipcContract = {
  // Liefert App-Version und Laufzeit – erster, harmloser Befehl, an dem
  // das ganze Sicherheitsmuster getestet wird.
  'app:getInfo': { request: z.undefined(), response: AppInfoSchema },
} as const;

export type IpcChannel = keyof typeof ipcContract;
export type IpcRequest<C extends IpcChannel> = z.infer<(typeof ipcContract)[C]['request']>;
export type IpcResponse<C extends IpcChannel> = z.infer<(typeof ipcContract)[C]['response']>;

// Antworten kommen immer als Ergebnisobjekt zurück, nie als geworfener Fehler.
// So gelangen keine Stacktraces mit Dateipfaden in die Oberfläche, und die
// Oberfläche muss Fehler bewusst behandeln (z. B. «Speichern fehlgeschlagen»).
export type IpcErrorCode = 'INVALID_REQUEST' | 'FORBIDDEN' | 'UNKNOWN_CHANNEL' | 'INTERNAL';
export type IpcResult<T> =
  { ok: true; data: T } | { ok: false; error: { code: IpcErrorCode; message: string } };
