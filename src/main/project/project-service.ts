// Projektdienst: Projekt anlegen, öffnen, schliessen, Profil ändern.
//
// Ein Projekt ist ein Ordner (SPEC «Projektordner»):
//   journal.sqlite   Datenbank
//   project.lock     Sperre, solange geöffnet
//   media/           Bilder
//   backups/         automatische Sicherungen
//   exports/         Vorschlag für Word-Exporte
//
// Es ist immer höchstens EIN Projekt geöffnet. Diese Klasse kennt kein
// Electron – Dialoge und App-Pfade kommen von aussen (testbar mit Vitest).
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import type { FolderKind, OpenResult, Profile, ProjectInfo } from '@shared/ipc';
import { checkIntegrity, openDatabase, transaction, type Db } from '../db/connection';
import { migrate, NewerSchemaError } from '../db/migrations';
import { BIPLA_CATEGORIES } from '@shared/bipla';
import { acquireLock, defaultEnv, type Env, type ProjectLock } from './lock';
import { detectSyncProvider } from './sync-detect';

export const DB_FILE = 'journal.sqlite';
export const PROJECT_DIRS = ['media', 'backups', 'exports'] as const;

// Dateien, die Windows/macOS ungefragt anlegen – Ordner gilt trotzdem als leer
const IGNORABLE = new Set(['desktop.ini', 'thumbs.db', '.ds_store']);

export type ServiceDeps = {
  appVersion: string;
  now?: () => Date;
  lockEnv?: Env;
  env?: Record<string, string | undefined>;
  // Wird nach jedem erfolgreichen Öffnen aufgerufen (z. B. verwaiste Bilder aufräumen)
  afterOpen?: () => void;
};

type OpenProject = { dir: string; db: Db; lock: ProjectLock; migratedFromVersion: number | null };

export class ProjectService {
  private current: OpenProject | null = null;
  private readonly now: () => Date;

  constructor(private readonly deps: ServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  get isOpen(): boolean {
    return this.current !== null;
  }

  // Datenbank des geöffneten Projekts (für spätere Dienste: Journale, Suche …)
  get db(): Db {
    if (!this.current) throw new Error('Kein Projekt geöffnet');
    return this.current.db;
  }

  // Ordner des geöffneten Projekts
  get dir(): string {
    if (!this.current) throw new Error('Kein Projekt geöffnet');
    return this.current.dir;
  }

  inspectFolder(dir: string): { kind: FolderKind; syncProvider: string | null } {
    const syncProvider = detectSyncProvider(dir, this.deps.env);
    if (!existsSync(dir)) return { kind: 'new', syncProvider };
    if (!statSync(dir).isDirectory()) return { kind: 'not-a-folder', syncProvider };
    if (existsSync(path.join(dir, DB_FILE))) return { kind: 'project', syncProvider };
    const entries = readdirSync(dir).filter((e) => !IGNORABLE.has(e.toLowerCase()));
    return { kind: entries.length === 0 ? 'empty' : 'not-empty', syncProvider };
  }

  async create(input: {
    dir: string;
    title: string;
    profile: Profile;
    seedCategories: boolean;
  }): Promise<OpenResult> {
    const { kind } = this.inspectFolder(input.dir);
    // Nie in einen Ordner mit fremden Dateien schreiben und nie ein bestehendes Projekt überschreiben
    if (kind !== 'new' && kind !== 'empty') return { status: 'not-allowed' };
    this.close();

    mkdirSync(input.dir, { recursive: true });
    for (const d of PROJECT_DIRS) mkdirSync(path.join(input.dir, d), { recursive: true });

    const lockResult = acquireLock(input.dir, this.deps.appVersion, { env: this.deps.lockEnv ?? defaultEnv });
    if (lockResult.status !== 'acquired') return { status: 'locked-here' };

    const db = openDatabase(path.join(input.dir, DB_FILE));
    try {
      await migrate(db);
      const ts = this.now().toISOString();
      transaction(db, () => {
        db.prepare(
          'INSERT INTO project (singleton, id, title, created_at, created_with_app_version) VALUES (1, ?, ?, ?, ?)',
        ).run(randomUUID(), input.title.trim(), ts, this.deps.appVersion);
        writeProfile(db, input.profile, true);
        if (input.seedCategories) {
          const insert = db.prepare(
            "INSERT INTO category (id, name, source, sort_order) VALUES (?, ?, 'bipla', ?)",
          );
          BIPLA_CATEGORIES.forEach((c, i) => insert.run(randomUUID(), c.name, i));
        }
      });
    } catch (err) {
      db.close();
      lockResult.lock.release();
      throw err;
    }
    this.current = { dir: input.dir, db, lock: lockResult.lock, migratedFromVersion: null };
    return { status: 'opened', project: this.info() };
  }

  async open(dir: string, options: { force?: boolean } = {}): Promise<OpenResult> {
    if (this.inspectFolder(dir).kind !== 'project') return { status: 'not-a-project' };
    // Dasselbe Projekt ist schon offen → einfach Infos zurückgeben
    if (this.current && path.resolve(this.current.dir) === path.resolve(dir)) {
      return { status: 'opened', project: this.info() };
    }
    this.close();

    const lockResult = acquireLock(dir, this.deps.appVersion, {
      force: options.force ?? false,
      env: this.deps.lockEnv ?? defaultEnv,
    });
    if (lockResult.status === 'locked-here') return { status: 'locked-here' };
    if (lockResult.status === 'locked-elsewhere') {
      const h = lockResult.holder;
      return {
        status: 'locked-elsewhere',
        holder: h ? { hostname: h.hostname, startedAt: h.startedAt } : null,
      };
    }

    let db: Db | null = null;
    try {
      db = openDatabase(path.join(dir, DB_FILE));
      const problems = checkIntegrity(db);
      if (problems.length > 0) {
        db.close();
        lockResult.lock.release();
        return { status: 'corrupt', problems: problems.slice(0, 10) };
      }
      const stamp = this.now().toISOString().replace(/[:.]/g, '-');
      const result = await migrate(db, {
        backupFile: (from) => path.join(dir, 'backups', `vor-update-format-${from}-${stamp}.sqlite`),
      });
      for (const d of PROJECT_DIRS) mkdirSync(path.join(dir, d), { recursive: true });
      this.current = {
        dir,
        db,
        lock: lockResult.lock,
        migratedFromVersion: result.from !== result.to ? result.from : null,
      };
      try {
        this.deps.afterOpen?.();
      } catch (err) {
        console.error('[projekt] Aufräumen nach dem Öffnen fehlgeschlagen:', err);
      }
      return { status: 'opened', project: this.info() };
    } catch (err) {
      db?.close();
      lockResult.lock.release();
      if (err instanceof NewerSchemaError) return { status: 'newer-version', message: err.message };
      // Keine SQLite-Datei oder unlesbar
      if (
        err instanceof Error &&
        /not a database|file is (encrypted|not a database)|malformed/i.test(err.message)
      ) {
        return { status: 'corrupt', problems: [err.message] };
      }
      throw err;
    }
  }

  close(): boolean {
    if (!this.current) return false;
    const { db, lock } = this.current;
    this.current = null;
    try {
      // WAL-Inhalt in die Hauptdatei schreiben, damit nach dem Schliessen nur
      // noch journal.sqlite existiert (sicherer beim Kopieren des Ordners)
      db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    } finally {
      db.close();
      lock.release();
    }
    return true;
  }

  updateProfile(profile: Profile): Profile {
    writeProfile(this.db, profile, false);
    return this.info().profile;
  }

  info(): ProjectInfo {
    if (!this.current) throw new Error('Kein Projekt geöffnet');
    const { db, dir, migratedFromVersion } = this.current;
    const p = db.prepare('SELECT id, title, created_at FROM project').get() as
      { id: string; title: string; created_at: string } | undefined;
    if (!p) throw new Error('Projektdatei ohne Projektangaben');
    const prof = db
      .prepare('SELECT display_name, company, apprenticeship_start, specialization FROM profile')
      .get() as
      | {
          display_name: string;
          company: string | null;
          apprenticeship_start: string | null;
          specialization: Profile['specialization'];
        }
      | undefined;
    const { n } = db.prepare('SELECT count(*) AS n FROM journal').get() as { n: number };
    return {
      id: p.id,
      title: p.title,
      path: dir,
      createdAt: p.created_at,
      profile: {
        displayName: prof?.display_name ?? '',
        company: prof?.company ?? null,
        apprenticeshipStart: prof?.apprenticeship_start ?? null,
        specialization: prof?.specialization ?? 'print',
      },
      syncProvider: detectSyncProvider(dir, this.deps.env),
      journalCount: n,
      migratedFromVersion,
    };
  }
}

function writeProfile(db: Db, p: Profile, insert: boolean): void {
  const values = [
    p.displayName.trim(),
    p.company?.trim() || null,
    p.apprenticeshipStart,
    p.specialization,
  ] as const;
  if (insert) {
    db.prepare(
      'INSERT INTO profile (singleton, display_name, company, apprenticeship_start, specialization) VALUES (1, ?, ?, ?, ?)',
    ).run(...values);
  } else {
    // UPSERT: falls die Zeile (z. B. nach Import) fehlt, wird sie angelegt
    db.prepare(
      `INSERT INTO profile (singleton, display_name, company, apprenticeship_start, specialization) VALUES (1, ?, ?, ?, ?)
       ON CONFLICT (singleton) DO UPDATE SET display_name = excluded.display_name, company = excluded.company,
         apprenticeship_start = excluded.apprenticeship_start, specialization = excluded.specialization`,
    ).run(...values);
  }
}
