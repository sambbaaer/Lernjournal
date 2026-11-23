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
import { validateSections } from '@shared/editor-schema';
import { effectiveSchoolYear, localIsoDate } from '@shared/school-year';
import { transaction, type Db } from '../db/connection';
import type { MediaService } from '../media/media-service';

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
    private readonly media?: MediaService,
  ) {}

  private get db() {
    return this.getDb();
  }

  private apprenticeshipStart(): string | null {
    const r = this.db.prepare('SELECT apprenticeship_start FROM profile').get() as
      { apprenticeship_start: string | null } | undefined;
    return r?.apprenticeship_start ?? null;
  }

  // Kategorien- und Schlagwort-IDs eines Journals
  private assignments(id: string): { categoryIds: string[]; tagIds: string[] } {
    const categoryIds = (
      this.db.prepare('SELECT category_id AS v FROM journal_category WHERE journal_id = ?').all(id) as {
        v: string;
      }[]
    ).map((r) => r.v);
    const tagIds = (
      this.db.prepare('SELECT tag_id AS v FROM journal_tag WHERE journal_id = ?').all(id) as { v: string }[]
    ).map((r) => r.v);
    return { categoryIds, tagIds };
  }

  private toSummary(r: Row, start: string | null, assigned = this.assignments(r.id)): JournalSummary {
    return {
      ...assigned,
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
    // Schlagwörter sind ebenfalls durchsuchbar (SPEC «Suche»)
    const tags = (
      this.db
        .prepare('SELECT t.name FROM tag t JOIN journal_tag jt ON jt.tag_id = t.id WHERE jt.journal_id = ?')
        .all(id) as {
        name: string;
      }[]
    ).map((t) => t.name);
    const body = [...SECTION_KEYS.map((k) => plainTextOf(sections[k])), tags.join(' ')].join('\n');
    this.db
      .prepare('INSERT INTO journal_fts (journal_id, title, body) VALUES (?, ?, ?)')
      .run(id, r.title, body);
  }

  // Suchindex für mehrere Journale neu schreiben (z. B. nach Umbenennen eines Schlagworts)
  resyncFts(ids: string[]): void {
    if (ids.length === 0) return;
    transaction(this.db, () => ids.forEach((id) => this.syncFts(id)));
  }

  // Suchindex komplett neu aufbauen (z. B. nach Import oder wenn er unvollständig ist)
  rebuildFts(): number {
    const ids = (this.db.prepare('SELECT id FROM journal').all() as { id: string }[]).map((r) => r.id);
    transaction(this.db, () => {
      this.db.prepare('DELETE FROM journal_fts').run();
      ids.forEach((id) => this.syncFts(id));
    });
    return ids.length;
  }

  summary(id: string): JournalSummary {
    return this.toSummary(this.row(id), this.apprenticeshipStart());
  }

  list(options: { includeArchived: boolean }): JournalSummary[] {
    const where = options.includeArchived ? '' : "WHERE status <> 'archived'";
    const rows = this.db
      .prepare(`SELECT ${COLUMNS} FROM journal ${where} ORDER BY work_date DESC, updated_at DESC`)
      .all() as Row[];
    const start = this.apprenticeshipStart();
    // Zuordnungen aller Journale in zwei Abfragen statt zwei pro Journal
    const cats = new Map<string, string[]>();
    const tags = new Map<string, string[]>();
    for (const r of this.db.prepare('SELECT journal_id, category_id FROM journal_category').all() as {
      journal_id: string;
      category_id: string;
    }[])
      cats.set(r.journal_id, [...(cats.get(r.journal_id) ?? []), r.category_id]);
    for (const r of this.db.prepare('SELECT journal_id, tag_id FROM journal_tag').all() as {
      journal_id: string;
      tag_id: string;
    }[])
      tags.set(r.journal_id, [...(tags.get(r.journal_id) ?? []), r.tag_id]);
    return rows.map((r) =>
      this.toSummary(r, start, { categoryIds: cats.get(r.id) ?? [], tagIds: tags.get(r.id) ?? [] }),
    );
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

  // Inhalt der drei Abschnitte speichern – nur nach Prüfung gegen das Editor-Schema
  updateSections(id: string, sections: Sections): JournalSummary {
    this.row(id);
    validateSections(sections); // wirft InvalidContentError
    transaction(this.db, () => {
      // Nur Bilder dieses Journals; Legenden in die Tabelle media übernehmen
      this.media?.checkAndSyncCaptions(id, sections);
      this.db
        .prepare('UPDATE journal SET sections_json = ?, updated_at = ? WHERE id = ?')
        .run(JSON.stringify(sections), this.now().toISOString(), id);
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
    let copiedFiles: string[] = [];
    try {
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
        // Bilder physisch mitkopieren (neue IDs) und Verweise im Inhalt ersetzen
        if (this.media) {
          const copy = this.media.copyForJournal(id, newId, src.sections_json);
          copiedFiles = copy.files;
          this.db.prepare('UPDATE journal SET sections_json = ? WHERE id = ?').run(copy.sectionsJson, newId);
        }
        this.syncFts(newId);
      });
    } catch (err) {
      // Transaktion zurückgerollt → kopierte Dateien wieder entfernen
      copiedFiles.forEach((f) => rmSync(f, { force: true }));
      throw err;
    }
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
      // Schlagwörter, die nur dieses Journal hatte, verschwinden mit
      this.db.prepare('DELETE FROM tag WHERE id NOT IN (SELECT tag_id FROM journal_tag)').run();
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
