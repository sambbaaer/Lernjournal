// Form der Brücke, die das Preload-Skript als `window.lernjournal` bereitstellt.
// Bewusst fachlich benannt (app.getInfo), nicht technisch (invoke(channel)):
// Die Oberfläche kann keine beliebigen Kanäle ansprechen.
import type { AppInfo, IpcResult } from './ipc';

export interface LernjournalApi {
  app: {
    getInfo(): Promise<IpcResult<AppInfo>>;
  };
}
