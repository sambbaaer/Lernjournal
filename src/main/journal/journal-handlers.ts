// IPC-Handler für Journale. Alle setzen ein geöffnetes Projekt voraus.
import type { Handlers } from '../ipc-handler';
import type { JournalService } from './journal-service';

type JournalChannels =
  | 'journal:list'
  | 'journal:get'
  | 'journal:create'
  | 'journal:updateMeta'
  | 'journal:updateSections'
  | 'journal:setStatus'
  | 'journal:duplicate'
  | 'journal:delete';

export function createJournalHandlers(journals: JournalService): Pick<Handlers, JournalChannels> {
  return {
    'journal:list': ({ includeArchived }) => journals.list({ includeArchived }),
    'journal:get': ({ id }) => journals.get(id),
    'journal:create': () => journals.create(),
    'journal:updateMeta': ({ id, meta }) => journals.updateMeta(id, meta),
    'journal:updateSections': ({ id, sections }) => journals.updateSections(id, sections),
    'journal:setStatus': ({ id, status }) => journals.setStatus(id, status),
    'journal:duplicate': ({ id }) => journals.duplicate(id),
    'journal:delete': ({ id }) => ({ deleted: journals.delete(id) }),
  };
}
