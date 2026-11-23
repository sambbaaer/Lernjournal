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
    closeReady: (req) => ipcRenderer.invoke('app:closeReady', req),
    // Nur dieses eine Ereignis vom Hauptprozess, ohne Ereignisdaten weiterzugeben
    onBeforeClose: (listener) => {
      const wrapped = () => listener();
      ipcRenderer.on('lj:before-close', wrapped);
      return () => ipcRenderer.removeListener('lj:before-close', wrapped);
    },
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
  taxonomy: {
    list: () => ipcRenderer.invoke('taxonomy:list'),
    create: (req) => ipcRenderer.invoke('taxonomy:create', req),
    rename: (req) => ipcRenderer.invoke('taxonomy:rename', req),
    merge: (req) => ipcRenderer.invoke('taxonomy:merge', req),
    delete: (req) => ipcRenderer.invoke('taxonomy:delete', req),
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
    setCategories: (req) => ipcRenderer.invoke('journal:setCategories', req),
    setTags: (req) => ipcRenderer.invoke('journal:setTags', req),
    setStatus: (req) => ipcRenderer.invoke('journal:setStatus', req),
    duplicate: (req) => ipcRenderer.invoke('journal:duplicate', req),
    delete: (req) => ipcRenderer.invoke('journal:delete', req),
  },
};

contextBridge.exposeInMainWorld('lernjournal', api);
