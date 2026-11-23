// Preload-Skript: läuft VOR der Oberfläche, in einer eigenen, isolierten Welt.
// Es stellt der Oberfläche genau eine Sache bereit: `window.lernjournal`.
//
// Wichtig: Wir reichen NIE ipcRenderer selbst weiter (sonst könnte die Seite
// beliebige Kanäle aufrufen), sondern nur fertige, benannte Funktionen.
import { contextBridge, ipcRenderer } from 'electron';
import type { LernjournalApi } from '@shared/api';

const api: LernjournalApi = {
  app: {
    getInfo: () => ipcRenderer.invoke('app:getInfo'),
  },
  project: {
    getState: () => ipcRenderer.invoke('project:getState'),
    chooseFolder: (req) => ipcRenderer.invoke('project:chooseFolder', req),
    inspectFolder: (req) => ipcRenderer.invoke('project:inspectFolder', req),
    create: (req) => ipcRenderer.invoke('project:create', req),
    open: (req) => ipcRenderer.invoke('project:open', req),
    close: () => ipcRenderer.invoke('project:close'),
  },
  profile: {
    update: (req) => ipcRenderer.invoke('profile:update', req),
  },
};

contextBridge.exposeInMainWorld('lernjournal', api);
