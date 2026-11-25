// Merkstellen (AJ-33) für das Fachbuch: alle markierten Stellen aller
// Journale, frisch aus der Datenbank gelesen. Keine eigene Tabelle – der Text
// steht nur im Journal (SPEC: Fachbuch speichert keine Kopien). Für einige
// hundert Journale ist das Durchsehen des JSON schnell genug; der Filter
// instr(sections_json, 'merkstelle') überspringt Journale ohne Merkstellen.
import { collectMerkstellen, type Merkstelle } from '@shared/merkstellen';
import type { JournalSummary } from '@shared/journal';
import type { Db } from '../db/connection';

type Row = {
  id: string;
  title: string;
  work_date: string;
  status: JournalSummary['status'];
  sections_json: string;
};

export class MerkstellenService {
  constructor(private readonly getDb: () => Db) {}

  list(): Merkstelle[] {
    const rows = this.getDb()
      .prepare(
        `SELECT id, title, work_date, status, sections_json FROM journal
         WHERE instr(sections_json, '"merkstelle"') > 0`,
      )
      .all() as Row[];
    const out: Merkstelle[] = [];
    for (const r of rows) {
      let sections: { doc: unknown }[];
      try {
        const parsed = JSON.parse(r.sections_json) as unknown;
        sections = Array.isArray(parsed) ? (parsed as { doc: unknown }[]) : [];
      } catch {
        continue;
      }
      for (const m of collectMerkstellen(sections)) {
        out.push({ ...m, journalId: r.id, journalTitle: r.title, workDate: r.work_date, status: r.status });
      }
    }
    // Alphabetisch nach Begriff (wie ein Register), dann neuestes Journal zuerst
    return out.sort(
      (a, b) =>
        a.term.localeCompare(b.term, 'de-CH', { sensitivity: 'base' }) ||
        b.workDate.localeCompare(a.workDate),
    );
  }
}
