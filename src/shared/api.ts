// Form der Brücke, die das Preload-Skript als `window.lernjournal` bereitstellt.
// Bewusst fachlich benannt (project.open), nicht technisch (invoke(channel)):
// Die Oberfläche kann keine beliebigen Kanäle ansprechen.
import type { IpcChannel, IpcRequest, IpcResponse, IpcResult } from './ipc';

type Call<C extends IpcChannel> =
  IpcRequest<C> extends undefined
    ? () => Promise<IpcResult<IpcResponse<C>>>
    : (req: IpcRequest<C>) => Promise<IpcResult<IpcResponse<C>>>;

export interface LernjournalApi {
  app: {
    getInfo: Call<'app:getInfo'>;
    openExternal: Call<'app:openExternal'>;
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
  };
  profile: {
    update: Call<'profile:update'>;
  };
  taxonomy: {
    list: Call<'taxonomy:list'>;
    create: Call<'taxonomy:create'>;
    rename: Call<'taxonomy:rename'>;
    merge: Call<'taxonomy:merge'>;
    delete: Call<'taxonomy:delete'>;
  };
  search: {
    query: Call<'search:query'>;
    rebuild: Call<'search:rebuild'>;
  };
  links: {
    list: Call<'link:list'>;
    add: Call<'link:add'>;
    remove: Call<'link:remove'>;
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
    setCategories: Call<'journal:setCategories'>;
    setTags: Call<'journal:setTags'>;
    search: Call<'journal:search'>;
    setStatus: Call<'journal:setStatus'>;
    duplicate: Call<'journal:duplicate'>;
    delete: Call<'journal:delete'>;
  };
}
