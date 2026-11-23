// Journal-Dienst: Anlegen, Lesen, Ändern, Duplizieren, Archivieren, Löschen.
// Arbeitet auf der Datenbank des geöffneten Projekts. Jede Änderung läuft in
// einer Transaktion und hält den Suchindex (journal_fts) gleich mit aktuell.
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import path from 'node:path';
import {
  EMPTY_SECTIONS,
  SECTION_KEYS,
  plainTextOf,
  type JournalDetail,
  type JournalMeta,
  type JournalSummary,
  type Sections,
} from '@shared/journal';
import { effectiveSchoolYear, localIsoDate } from '@shared/school-year';
import { transaction, type Db } from '../db/connection';

type Row = {
  id: string;
  title: string;
  work_date: string;
  status: JournalSummary['status'];
  learning_place: JournalSummary['learningPlace'];
  school_year_override: number | null;
  sections_json: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

const COLUMNS =
  'id, title, work_date, status, learning_place, school_year_override, sections_json, created_at, updated_at, completed_at';

export class JournalNotFoundError extends Error {
  constructor(id: string) {
    super(`Journal ${id} nicht gefunden`);
  }
}

export class JournalService {
  constructor(
    private readonly getDb: () => Db,
    private readonly projectDir: () => string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private get db() {
    return this.getDb();
  }

  private apprenticeshipStart(): string | null {
    const r = this.db.prepare('SELECT apprenticeship_start FROM profile').get() as
      { apprenticeship_start: string | null } | undefined;
    return r?.apprenticeship_start ?? null;
  }

  private toSummary(r: Row, start: string | null): JournalSummary {
    return {
      id: r.id,
      title: r.title,
      workDate: r.work_date,
      status: r.status,
      learningPlace: r.learning_place,
      schoolYear: effectiveSchoolYear(start, r.work_date, r.school_year_override),
      schoolYearOverride: r.school_year_override,
      updatedAt: r.updated_at,
      completedAt: r.completed_at,
    };
  }

  private row(id: string): Row {
    const r = this.db.prepare(`SELECT ${COLUMNS} FROM journal WHERE id = ?`).get(id) as Row | undefined;
    if (!r) throw new JournalNotFoundError(id);
    return r;
  }

  // Suchindex für ein Journal neu schreiben (Titel + Text aller Abschnitte)
  private syncFts(id: string): void {
    this.db.prepare('DELETE FROM journal_fts WHERE journal_id = ?').run(id);
    const r = this.db.prepare('SELECT title, sections_json FROM journal WHERE id = ?').get(id) as
      { title: string; sections_json: string } | undefined;
    if (!r) return;
    const sections = JSON.parse(r.sections_json) as Sections;
    const body = SECTION_KEYS.map((k) => plainTextOf(sections[k])).join('\n');
    this.db
      .prepare('INSERT INTO journal_fts (journal_id, title, body) VALUES (?, ?, ?)')
      .run(id, r.title, body);
  }

  list(options: { includeArchived: boolean }): JournalSummary[] {
    const where = options.includeArchived ? '' : "WHERE status <> 'archived'";
    const rows = this.db
      .prepare(`SELECT ${COLUMNS} FROM journal ${where} ORDER BY work_date DESC, updated_at DESC`)
      .all() as Row[];
    const start = this.apprenticeshipStart();
    return rows.map((r) => this.toSummary(r, start));
  }

  get(id: string): JournalDetail {
    const r = this.row(id);
    return {
      ...this.toSummary(r, this.apprenticeshipStart()),
      createdAt: r.created_at,
      sections: JSON.parse(r.sections_json) as Sections,
    };
  }

  create(input: { title?: string; workDate?: string } = {}): JournalDetail {
    const id = randomUUID();
    const ts = this.now().toISOString();
    transaction(this.db, () => {
      this.db
        .prepare(
          `INSERT INTO journal (id, title, work_date, status, learning_place, sections_json, created_at, updated_at)
           VALUES (?, ?, ?, 'draft', 'betrieb', ?, ?, ?)`,
        )
        .run(
          id,
          input.title ?? '',
          input.workDate ?? localIsoDate(this.now()),
          JSON.stringify(EMPTY_SECTIONS),
          ts,
          ts,
        );
      this.syncFts(id);
    });
    return this.get(id);
  }

  updateMeta(id: string, meta: JournalMeta): JournalSummary {
    this.row(id);
    transaction(this.db, () => {
      this.db
        .prepare(
          `UPDATE journal SET title = ?, work_date = ?, learning_place = ?, school_year_override = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(
          meta.title,
          meta.workDate,
          meta.learningPlace,
          meta.schoolYearOverride,
          this.now().toISOString(),
          id,
        );
      this.syncFts(id);
    });
    return this.toSummary(this.row(id), this.apprenticeshipStart());
  }

  setStatus(id: string, status: JournalSummary['status']): JournalSummary {
    const current = this.row(id);
    const ts = this.now().toISOString();
    // Abschlussdatum: beim Abschliessen setzen, beim Zurück-zu-Entwurf löschen,
    // beim Archivieren behalten (ein archiviertes Journal kann abgeschlossen gewesen sein)
    const completedAt =
      status === 'completed'
        ? current.status === 'completed'
          ? current.completed_at
          : ts
        : status === 'draft'
          ? null
          : current.completed_at;
    this.db
      .prepare('UPDATE journal SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?')
      .run(status, completedAt, ts, id);
    return this.toSummary(this.row(id), this.apprenticeshipStart());
  }

  // Kopie als neuer Entwurf mit Datum heute. Kategorien und Schlagwörter werden
  // übernommen, Verknüpfungen nicht (die beziehen sich auf das Original).
  duplicate(id: string): JournalDetail {
    const src = this.row(id);
    const newId = randomUUID();
    const ts = this.now().toISOString();
    transaction(this.db, () => {
      this.db
        .prepare(
          `INSERT INTO journal (id, title, work_date, status, learning_place, school_year_override, sections_json, created_at, updated_at)
           VALUES (?, ?, ?, 'draft', ?, NULL, ?, ?, ?)`,
        )
        .run(
          newId,
          copyTitle(src.title),
          localIsoDate(this.now()),
          src.learning_place,
          src.sections_json,
          ts,
          ts,
        );
      this.db
        .prepare(
          'INSERT INTO journal_category (journal_id, category_id) SELECT ?, category_id FROM journal_category WHERE journal_id = ?',
        )
        .run(newId, id);
      this.db
        .prepare(
          'INSERT INTO journal_tag (journal_id, tag_id) SELECT ?, tag_id FROM journal_tag WHERE journal_id = ?',
        )
        .run(newId, id);
      // Bilder (AJ-07): Dateien werden dann mitkopiert; bis dahin gibt es keine
      this.syncFts(newId);
    });
    return this.get(newId);
  }

  // Endgültig löschen inkl. Zuordnungen (Cascade) und Bilddateien.
  delete(id: string): boolean {
    this.row(id);
    const media = this.db.prepare('SELECT relative_path FROM media WHERE journal_id = ?').all(id) as {
      relative_path: string;
    }[];
    transaction(this.db, () => {
      this.db.prepare('DELETE FROM journal_fts WHERE journal_id = ?').run(id);
      this.db.prepare('DELETE FROM journal WHERE id = ?').run(id);
    });
    // Dateien erst NACH erfolgreichem Commit löschen – nie Daten ohne Datei
    // hinterlassen. Pfade stammen aus der DB und sind per CHECK auf media/ beschränkt.
    const mediaDir = path.resolve(this.projectDir(), 'media');
    for (const m of media) {
      const file = path.resolve(this.projectDir(), m.relative_path);
      if (file.startsWith(mediaDir + path.sep)) rmSync(file, { force: true });
    }
    return true;
  }
}

export function copyTitle(title: string): string {
  const t = title.trim();
  return t ? `Kopie von ${t}` : 'Kopie';
}
