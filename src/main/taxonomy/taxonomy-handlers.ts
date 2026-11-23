// IPC-Handler für Kategorien und Schlagwörter (AJ-09). Alle setzen ein
// geöffnetes Projekt voraus. Namen sind bereits durch das zod-Schema
// vereinheitlicht und geprüft (src/shared/taxonomy.ts).
import type { Handlers } from '../ipc-handler';
import type { JournalService } from '../journal/journal-service';
import type { TaxonomyService } from './taxonomy-service';

type TaxonomyChannels =
  | 'taxonomy:list'
  | 'category:create'
  | 'category:addSuggestions'
  | 'taxonomy:rename'
  | 'taxonomy:merge'
  | 'taxonomy:delete'
  | 'journal:setCategories'
  | 'journal:setTags';

export function createTaxonomyHandlers(
  taxonomy: TaxonomyService,
  journals: JournalService,
): Pick<Handlers, TaxonomyChannels> {
  // Änderung ausführen, danach immer die aktuelle Liste zurückgeben
  const thenList = (change: () => unknown) => {
    change();
    return taxonomy.list();
  };
  return {
    'taxonomy:list': () => taxonomy.list(),
    'category:create': ({ name }) => thenList(() => taxonomy.createCategory(name)),
    'category:addSuggestions': () => thenList(() => taxonomy.addMissingSuggestions()),
    'taxonomy:rename': ({ kind, id, name }) => thenList(() => taxonomy.rename(kind, id, name)),
    'taxonomy:merge': ({ kind, sourceId, targetId }) =>
      thenList(() => taxonomy.merge(kind, sourceId, targetId)),
    'taxonomy:delete': ({ kind, id }) => thenList(() => taxonomy.delete(kind, id)),
    'journal:setCategories': ({ id, categoryIds }) => {
      taxonomy.setJournalCategories(id, categoryIds);
      return { journal: journals.summary(id), taxonomy: taxonomy.list() };
    },
    'journal:setTags': ({ id, names }) => {
      taxonomy.setJournalTags(id, names);
      return { journal: journals.summary(id), taxonomy: taxonomy.list() };
    },
  };
}
