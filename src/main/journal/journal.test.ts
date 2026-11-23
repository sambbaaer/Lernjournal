// Tests des Journal-Dienstes auf einer echten Projektdatenbank.
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProjectService } from '../project/project-service';
import { copyTitle, JournalNotFoundError, JournalService } from './journal-service';

let root: string;
let projects: ProjectService;
let journals: JournalService;
let clock = new Date('2026-03-14T09:00:00Z');

beforeEach(async () => {
  root = mkdtempSync(path.join(tmpdir(), 'lj-j-'));
  projects = new ProjectService({
    appVersion: '0.1.0',
    env: {},
    lockEnv: { pid: 1, hostname: 'PC', isProcessAlive: () => true, now: () => new Date() },
  });
  await projects.create({
    dir: path.join(root, 'p'),
    title: 'P',
    profile: {
      displayName: 'Lea',
      company: null,
      apprenticeshipStart: '2025-08-04',
      specialization: 'print',
    },
    seedCategories: true,
  });
  clock = new Date('2026-03-14T09:00:00Z');
  journals = new JournalService(
    () => projects.db,
    () => projects.dir,
    () => clock,
  );
});
afterEach(() => {
  projects.close();
  rmSync(root, { recursive: true, force: true });
});

describe('Journal-Dienst', () => {
  it('legt einen Entwurf mit Standardwerten an (heute, Betrieb, leere Abschnitte)', () => {
    const j = journals.create();
    expect(j).toMatchObject({
      title: '',
      workDate: '2026-03-14',
      status: 'draft',
      learningPlace: 'betrieb',
      schoolYear: 1,
    });
    expect(Object.keys(j.sections)).toEqual(['auftrag', 'durchfuehrung', 'reflexion']);
    expect(journals.list({ includeArchived: false })).toHaveLength(1);
  });

  it('Metadaten ändern; Lehrjahr berechnet und manuell überschreibbar', () => {
    const j = journals.create();
    clock = new Date('2026-03-14T10:00:00Z');
    let s = journals.updateMeta(j.id, {
      title: 'Plattenwechsel',
      workDate: '2026-09-01',
      learningPlace: 'uek',
      schoolYearOverride: null,
    });
    expect(s).toMatchObject({
      title: 'Plattenwechsel',
      schoolYear: 2,
      learningPlace: 'uek',
      updatedAt: '2026-03-14T10:00:00.000Z',
    });
    s = journals.updateMeta(j.id, {
      title: 'Plattenwechsel',
      workDate: '2026-09-01',
      learningPlace: 'uek',
      schoolYearOverride: 3,
    });
    expect(s.schoolYear).toBe(3);
  });

  it('Status: Abschliessen setzt Datum, zurück zu Entwurf löscht es, Archiv behält es', () => {
    const j = journals.create();
    let s = journals.setStatus(j.id, 'completed');
    expect(s.completedAt).toBe(clock.toISOString());
    s = journals.setStatus(j.id, 'archived');
    expect(s).toMatchObject({ status: 'archived', completedAt: clock.toISOString() });
    expect(journals.list({ includeArchived: false })).toHaveLength(0);
    expect(journals.list({ includeArchived: true })).toHaveLength(1);
    s = journals.setStatus(j.id, 'draft');
    expect(s.completedAt).toBeNull();
  });

  it('Duplizieren: neuer Entwurf mit Inhalt, Kategorien und Schlagwörtern, aber ohne Verknüpfungen', () => {
    const a = journals.create({ title: 'Farbmessung', workDate: '2026-01-10' });
    const b = journals.create({ title: 'Anderes' });
    const db = projects.db;
    const cat = db.prepare('SELECT id FROM category LIMIT 1').get() as { id: string };
    db.prepare('INSERT INTO journal_category VALUES (?, ?)').run(a.id, cat.id);
    db.prepare("INSERT INTO tag VALUES ('t1', 'Offset')").run();
    db.prepare("INSERT INTO journal_tag VALUES (?, 't1')").run(a.id);
    db.prepare('INSERT INTO journal_link VALUES (?, ?, ?)').run(a.id, b.id, clock.toISOString());
    journals.setStatus(a.id, 'completed');

    const c = journals.duplicate(a.id);
    expect(c).toMatchObject({
      title: 'Kopie von Farbmessung',
      status: 'draft',
      workDate: '2026-03-14',
      completedAt: null,
    });
    expect(c.id).not.toBe(a.id);
    expect(db.prepare('SELECT count(*) n FROM journal_category WHERE journal_id = ?').get(c.id)).toEqual({
      n: 1,
    });
    expect(db.prepare('SELECT count(*) n FROM journal_tag WHERE journal_id = ?').get(c.id)).toEqual({ n: 1 });
    expect(
      db
        .prepare('SELECT count(*) n FROM journal_link WHERE source_journal_id = ? OR target_journal_id = ?')
        .get(c.id, c.id),
    ).toEqual({ n: 0 });
  });

  it('Löschen entfernt Journal, Zuordnungen, Suchindex und Bilddateien', () => {
    const j = journals.create({ title: 'Weg damit' });
    const db = projects.db;
    const file = path.join(projects.dir, 'media', 'bild.png');
    writeFileSync(file, 'png');
    db.prepare(
      'INSERT INTO media (id, journal_id, relative_path, original_name, mime_type, width, height, sha256, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    ).run('m1', j.id, 'media/bild.png', 'bild.png', 'image/png', 1, 1, 'a'.repeat(64), clock.toISOString());
    expect(journals.delete(j.id)).toBe(true);
    expect(() => journals.get(j.id)).toThrow(JournalNotFoundError);
    expect(existsSync(file)).toBe(false);
    expect(db.prepare('SELECT count(*) n FROM media').get()).toEqual({ n: 0 });
    expect(db.prepare('SELECT count(*) n FROM journal_fts').get()).toEqual({ n: 0 });
  });

  it('Suchindex folgt dem Titel', () => {
    const j = journals.create();
    journals.updateMeta(j.id, {
      title: 'Möglichkeiten der Falzung',
      workDate: '2026-03-14',
      learningPlace: 'betrieb',
      schoolYearOverride: null,
    });
    const hits = projects.db
      .prepare("SELECT journal_id FROM journal_fts WHERE journal_fts MATCH 'moglichkeiten'")
      .all();
    expect(hits).toEqual([{ journal_id: j.id }]);
  });

  it('Liste: neuestes Arbeitsdatum zuoberst', () => {
    journals.create({ title: 'alt', workDate: '2025-09-01' });
    journals.create({ title: 'neu', workDate: '2026-02-01' });
    expect(journals.list({ includeArchived: false }).map((j) => j.title)).toEqual(['neu', 'alt']);
  });

  it('unbekannte ID: klarer Fehler', () => {
    expect(() => journals.setStatus('00000000-0000-4000-8000-000000000000', 'draft')).toThrow(
      JournalNotFoundError,
    );
  });

  it('Kopie-Titel', () => {
    expect(copyTitle('  ')).toBe('Kopie');
    expect(copyTitle('X')).toBe('Kopie von X');
  });
});
