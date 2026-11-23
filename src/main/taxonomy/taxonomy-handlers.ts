// IPC-Handler für Kategorien und Schlagwörter.
import type { Handlers } from '../ipc-handler';
import type { JournalService } from '../journal/journal-service';
import type { TaxonomyService } from './taxonomy-service';

type Channels =
  | 'taxonomy:list'
  | 'taxonomy:create'
  | 'taxonomy:rename'
  | 'taxonomy:merge'
  | 'taxonomy:delete'
  | 'journal:setCategories'
  | 'journal:setTags';

export function createTaxonomyHandlers(
  tax: TaxonomyService,
  journals: JournalService,
): Pick<Handlers, Channels> {
  return {
    'taxonomy:list': () => tax.list(),
    'taxonomy:create': ({ kind, name }) => {
      tax.create(kind, name);
      return tax.list();
    },
    'taxonomy:rename': ({ kind, id, name }) => {
      tax.rename(kind, id, name);
      return tax.list();
    },
    'taxonomy:merge': ({ kind, sourceId, targetId }) => {
      tax.merge(kind, sourceId, targetId);
      return tax.list();
    },
    'taxonomy:delete': ({ kind, id }) => {
      tax.delete(kind, id);
      return tax.list();
    },
    'journal:setCategories': ({ id, categoryIds }) => {
      journals.summary(id); // wirft, wenn es das Journal nicht gibt
      tax.setJournalCategories(id, categoryIds);
      return { journal: journals.summary(id), ...tax.list() };
    },
    'journal:setTags': ({ id, tags }) => {
      journals.summary(id);
      tax.setJournalTags(id, tags);
      return { journal: journals.summary(id), ...tax.list() };
    },
  };
}
