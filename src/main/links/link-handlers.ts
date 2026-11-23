// IPC-Handler für Journal-Verknüpfungen (AJ-10). Alle setzen ein geöffnetes
// Projekt voraus; IDs sind bereits durch das zod-Schema als UUID geprüft.
import type { Handlers } from '../ipc-handler';
import type { JournalService } from '../journal/journal-service';
import type { LinkService } from './link-service';

type LinkChannels = 'journal:links' | 'journal:link' | 'journal:unlink';

export function createLinkHandlers(
  links: LinkService,
  journals: JournalService,
): Pick<Handlers, LinkChannels> {
  // Nach einer Änderung: neue Liste + aktuelle Zusammenfassung des Journals
  const result = (id: string) => ({ journal: journals.summary(id), links: links.list(id) });
  return {
    'journal:links': ({ id }) => links.list(id),
    'journal:link': ({ id, otherId }) => {
      links.add(id, otherId);
      return result(id);
    },
    'journal:unlink': ({ id, otherId }) => {
      links.remove(id, otherId);
      return result(id);
    },
  };
}
