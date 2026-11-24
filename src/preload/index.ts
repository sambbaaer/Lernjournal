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
    setCategories: (req) => ipcRenderer.invoke('journal:setCategories', req),
    setTags: (req) => ipcRenderer.invoke('journal:setTags', req),
    links: (req) => ipcRenderer.invoke('journal:links', req),
    link: (req) => ipcRenderer.invoke('journal:link', req),
    unlink: (req) => ipcRenderer.invoke('journal:unlink', req),
  },
  search: {
    query: (req) => ipcRenderer.invoke('search:query', req),
    rebuild: () => ipcRenderer.invoke('search:rebuild'),
  },
  export: {
    journalDocx: (req) => ipcRenderer.invoke('export:journalDocx', req),
    collectionDocx: (req) => ipcRenderer.invoke('export:collectionDocx', req),
    showFile: () => ipcRenderer.invoke('export:showFile'),
  },
  archive: {
    export: () => ipcRenderer.invoke('archive:export'),
    showFile: () => ipcRenderer.invoke('archive:showFile'),
    chooseImport: () => ipcRenderer.invoke('archive:chooseImport'),
    chooseImportTarget: () => ipcRenderer.invoke('archive:chooseImportTarget'),
    import: () => ipcRenderer.invoke('archive:import'),
    // Nur dieses Ereignis, und nur die zwei erwarteten Felder weitergeben
    onProgress: (listener) => {
      const wrapped = (_e: unknown, p: { step?: unknown; percent?: unknown } | undefined) =>
        listener({
          step: typeof p?.step === 'string' ? p.step.slice(0, 200) : '',
          percent: typeof p?.percent === 'number' ? p.percent : null,
        });
      ipcRenderer.on('lj:archive-progress', wrapped);
      return () => ipcRenderer.removeListener('lj:archive-progress', wrapped);
    },
  },
  taxonomy: {
    list: () => ipcRenderer.invoke('taxonomy:list'),
    createCategory: (req) => ipcRenderer.invoke('category:create', req),
    addSuggestions: () => ipcRenderer.invoke('category:addSuggestions'),
    rename: (req) => ipcRenderer.invoke('taxonomy:rename', req),
    merge: (req) => ipcRenderer.invoke('taxonomy:merge', req),
    delete: (req) => ipcRenderer.invoke('taxonomy:delete', req),
  },
};

contextBridge.exposeInMainWorld('lernjournal', api);
