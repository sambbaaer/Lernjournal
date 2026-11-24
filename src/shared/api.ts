// Form der Brücke, die das Preload-Skript als `window.lernjournal` bereitstellt.
// Bewusst fachlich benannt (project.open), nicht technisch (invoke(channel)):
// Die Oberfläche kann keine beliebigen Kanäle ansprechen.
import type { ArchiveProgress } from './archive';
import type { IpcChannel, IpcRequest, IpcResponse, IpcResult } from './ipc';

type Call<C extends IpcChannel> =
  IpcRequest<C> extends undefined
    ? () => Promise<IpcResult<IpcResponse<C>>>
    : (req: IpcRequest<C>) => Promise<IpcResult<IpcResponse<C>>>;

export interface LernjournalApi {
  app: {
    getInfo: Call<'app:getInfo'>;
    closeReady: Call<'app:closeReady'>;
    // Der Hauptprozess meldet «Fenster wird geschlossen – bitte speichern».
    // Gibt eine Funktion zum Abmelden zurück.
    onBeforeClose(listener: () => void): () => void;
  };
  project: {
    getState: Call<'project:getState'>;
    chooseFolder: Call<'project:chooseFolder'>;
    inspectFolder: Call<'project:inspectFolder'>;
    create: Call<'project:create'>;
    open: Call<'project:open'>;
    close: Call<'project:close'>;
    // Erinnerung an die Projektübergabe ausblenden (AJ-15)
    snoozeExportReminder: Call<'project:snoozeExportReminder'>;
  };
  profile: {
    update: Call<'profile:update'>;
  };
  media: {
    add: Call<'media:add'>;
  };
  journal: {
    list: Call<'journal:list'>;
    get: Call<'journal:get'>;
    create: Call<'journal:create'>;
    updateMeta: Call<'journal:updateMeta'>;
    updateSections: Call<'journal:updateSections'>;
    setStatus: Call<'journal:setStatus'>;
    duplicate: Call<'journal:duplicate'>;
    delete: Call<'journal:delete'>;
    setCategories: Call<'journal:setCategories'>;
    setTags: Call<'journal:setTags'>;
    // Verknüpfungen (AJ-10)
    links: Call<'journal:links'>;
    link: Call<'journal:link'>;
    unlink: Call<'journal:unlink'>;
  };
  // Fachbuch-Suche (AJ-11)
  search: {
    query: Call<'search:query'>;
    rebuild: Call<'search:rebuild'>;
  };
  // Word-Export (AJ-12 Einzel-DOCX, AJ-13 Sammel-DOCX)
  export: {
    journalDocx: Call<'export:journalDocx'>;
    collectionDocx: Call<'export:collectionDocx'>;
    showFile: Call<'export:showFile'>;
  };
  // Projektübergabe .ajournal (AJ-14)
  archive: {
    export: Call<'archive:export'>;
    showFile: Call<'archive:showFile'>;
    chooseImport: Call<'archive:chooseImport'>;
    chooseImportTarget: Call<'archive:chooseImportTarget'>;
    import: Call<'archive:import'>;
    // Fortschritt einer laufenden Übergabe, eines Imports oder einer
    // Wiederherstellung (AJ-15). Gibt eine Funktion zum Abmelden zurück.
    onProgress(listener: (progress: ArchiveProgress) => void): () => void;
  };
  // Sicherungen und Wiederherstellung (AJ-15)
  backup: {
    list: Call<'backup:list'>;
    create: Call<'backup:create'>;
    preview: Call<'backup:preview'>;
    chooseRestoreTarget: Call<'backup:chooseRestoreTarget'>;
    restore: Call<'backup:restore'>;
  };
  taxonomy: {
    list: Call<'taxonomy:list'>;
    createCategory: Call<'category:create'>;
    addSuggestions: Call<'category:addSuggestions'>;
    rename: Call<'taxonomy:rename'>;
    merge: Call<'taxonomy:merge'>;
    delete: Call<'taxonomy:delete'>;
  };
}
