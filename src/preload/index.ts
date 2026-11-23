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
  media: {
    add: (req) => ipcRenderer.invoke('media:add', req),
  },
  journal: {
    list: (req) => ipcRenderer.invoke('journal:list', req),
    get: (req) => ipcRenderer.invoke('journal:get', req),
    create: () => ipcRenderer.invoke('journal:create'),
    updateMeta: (req) => ipcRenderer.invoke('journal:updateMeta', req),
    updateSections: (req) => ipcRenderer.invoke('journal:updateSections', req),
    setStatus: (req) => ipcRenderer.invoke('journal:setStatus', req),
    duplicate: (req) => ipcRenderer.invoke('journal:duplicate', req),
    delete: (req) => ipcRenderer.invoke('journal:delete', req),
  },
};

contextBridge.exposeInMainWorld('lernjournal', api);
