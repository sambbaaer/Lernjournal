// IPC-Handler für die Fachbuch-Suche (AJ-11). Setzen ein geöffnetes Projekt
// voraus. Die Anfrage ist bereits durch das zod-Schema geprüft (Länge, Typen).
import type { Handlers } from '../ipc-handler';
import type { SearchIndex } from './search-index';

export function createSearchHandlers(search: SearchIndex): Pick<Handlers, 'search:query' | 'search:rebuild'> {
  return {
    'search:query': ({ query, includeArchived }) => search.search(query, { includeArchived }),
    'search:rebuild': () => search.rebuild(),
  };
}
