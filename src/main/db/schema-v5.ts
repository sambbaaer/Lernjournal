import { LegacySectionsSchema, type JournalTemplateId } from '@shared/journal';
import { sectionsFromLegacy } from '@shared/journal-templates';
import type { Db } from './connection';
import { fillSearchIndex } from '../search/search-index';

// Schema v5 speichert eine geordnete Abschnittsliste im vorhandenen JSON-Feld.
// Die Migration läuft zusammen mit der Versionsnummer in einer Transaktion.
export function migrateJournalSections(db: Db): void {
  const rows = db.prepare('SELECT id FROM journal').all() as { id: string }[];
  const get = db.prepare('SELECT template, sections_json FROM journal WHERE id = ?');
  const update = db.prepare('UPDATE journal SET sections_json = ? WHERE id = ?');
  for (const { id } of rows) {
    const row = get.get(id) as { template: JournalTemplateId; sections_json: string };
    const legacy = LegacySectionsSchema.parse(JSON.parse(row.sections_json));
    update.run(JSON.stringify(sectionsFromLegacy(row.template, legacy)), id);
  }
  fillSearchIndex(db);
}
