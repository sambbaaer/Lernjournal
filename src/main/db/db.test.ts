// Tests: Schema-Regeln (Datenintegrität), Migrationen, Integritätsprüfung.
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkIntegrity, openDatabase, transaction, type Db } from './connection';
import {
  getSchemaVersion,
  LATEST_VERSION,
  migrate,
  MIGRATIONS,
  NewerSchemaError,
  type Migration,
} from './migrations';

let dir: string;
let db: Db;
const now = '2026-11-23T10:00:00.000Z';
const emptySections = JSON.stringify({
  auftrag: { type: 'doc' },
  durchfuehrung: { type: 'doc' },
  reflexion: { type: 'doc' },
});

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'lj-db-'));
  db = openDatabase(path.join(dir, 'journal.sqlite'));
  await migrate(db);
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function insertJournal(id: string, extra: Record<string, unknown> = {}) {
  const row = {
    id,
    title: 'Test',
    work_date: '2026-03-14',
    sections_json: emptySections,
    created_at: now,
    updated_at: now,
    ...extra,
  };
  const cols = Object.keys(row);
  db.prepare(`INSERT INTO journal (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(
    ...(Object.values(row) as (string | number | null)[]),
  );
}
const rejects = (fn: () => unknown) => expect(fn).toThrow();

describe('Verbindung', () => {
  it('nutzt WAL, synchronous=FULL und Fremdschlüssel', () => {
    expect(db.prepare('PRAGMA journal_mode').get()).toEqual({ journal_mode: 'wal' });
    expect(db.prepare('PRAGMA synchronous').get()).toEqual({ synchronous: 2 });
    expect(db.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
  });
  it('transaction rollt bei Fehler alles zurück', () => {
    rejects(() =>
      transaction(db, () => {
        insertJournal('a');
        insertJournal('a'); // doppelte ID
      }),
    );
    expect(db.prepare('SELECT count(*) n FROM journal').get()).toEqual({ n: 0 });
  });
});

describe('Schema v1: Datenintegrität', () => {
  it('neue Datenbank hat die aktuelle Version und ist intakt', () => {
    expect(getSchemaVersion(db)).toBe(LATEST_VERSION);
    expect(checkIntegrity(db)).toEqual([]);
  });

  it('Journal: Status, Lernort, Datum, Lehrjahr und JSON werden geprüft', () => {
    insertJournal('ok');
    rejects(() => insertJournal('s', { status: 'freigegeben' }));
    rejects(() => insertJournal('l', { learning_place: 'zuhause' }));
    rejects(() => insertJournal('d', { work_date: '14.03.2026' }));
    rejects(() => insertJournal('d2', { work_date: '2026-02-30' }));
    rejects(() => insertJournal('y', { school_year_override: 5 }));
    rejects(() => insertJournal('j', { sections_json: '{kaputt' }));
    // «Abgeschlossen» ohne Abschlussdatum ist nicht erlaubt
    rejects(() => insertJournal('c', { status: 'completed' }));
    insertJournal('c2', { status: 'completed', completed_at: now });
  });

  it('Kategorien und Schlagwörter: eindeutig ohne Gross-/Kleinschreibung, keine leeren Namen', () => {
    db.prepare("INSERT INTO tag VALUES ('t1', 'Offset')").run();
    rejects(() => db.prepare("INSERT INTO tag VALUES ('t2', 'offset')").run());
    rejects(() => db.prepare("INSERT INTO tag VALUES ('t3', '   ')").run());
    db.prepare("INSERT INTO category (id, name, source) VALUES ('c1', 'e – Druckaufträge', 'bipla')").run();
    rejects(() => db.prepare("INSERT INTO category (id, name, source) VALUES ('c2', 'x', 'fremd')").run());
  });

  it('Zuordnungen: keine Duplikate, nur bestehende Journale, Löschen räumt auf', () => {
    insertJournal('j1');
    db.prepare("INSERT INTO tag VALUES ('t1', 'Offset')").run();
    db.prepare("INSERT INTO journal_tag VALUES ('j1', 't1')").run();
    rejects(() => db.prepare("INSERT INTO journal_tag VALUES ('j1', 't1')").run());
    rejects(() => db.prepare("INSERT INTO journal_tag VALUES ('gibts-nicht', 't1')").run());
    db.prepare("DELETE FROM journal WHERE id = 'j1'").run();
    expect(db.prepare('SELECT count(*) n FROM journal_tag').get()).toEqual({ n: 0 });
  });

  it('Verknüpfungen: keine Selbstlinks, keine doppelte Beziehung in Gegenrichtung', () => {
    insertJournal('a');
    insertJournal('b');
    const link = (s: string, t: string) =>
      db.prepare('INSERT INTO journal_link VALUES (?, ?, ?)').run(s, t, now);
    link('a', 'b');
    rejects(() => link('a', 'a'));
    rejects(() => link('a', 'b'));
    rejects(() => link('b', 'a')); // gleiche Beziehung, nur umgekehrt
    db.prepare("DELETE FROM journal WHERE id = 'b'").run();
    expect(db.prepare('SELECT count(*) n FROM journal_link').get()).toEqual({ n: 0 });
  });

  it('Medien: nur erlaubte Typen und Pfade innerhalb von media/', () => {
    insertJournal('j1');
    const media = (id: string, rel: string, mime = 'image/png') =>
      db
        .prepare(
          'INSERT INTO media (id, journal_id, relative_path, original_name, mime_type, width, height, sha256, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
        )
        .run(id, 'j1', rel, 'a.png', mime, 10, 10, 'a'.repeat(64), now);
    media('m1', 'media/m1.png');
    rejects(() => media('m2', '../geheim.png'));
    rejects(() => media('m3', 'media/../../geheim.png'));
    rejects(() => media('m4', 'media\\m4.png'));
    rejects(() => media('m5', 'media/m5.gif', 'image/gif'));
    rejects(() => media('m6', 'media/m1.png')); // Pfad doppelt
  });

  it('Profil und Projekt: genau eine Zeile; Fachrichtung Standard «print»', () => {
    db.prepare("INSERT INTO profile (singleton, display_name) VALUES (1, 'Muster')").run();
    expect(db.prepare('SELECT specialization FROM profile').get()).toEqual({ specialization: 'print' });
    rejects(() => db.prepare("UPDATE profile SET apprenticeship_start = '01.08.2025'").run());
    db.prepare("UPDATE profile SET apprenticeship_start = '2025-08-01'").run();
    rejects(() => db.prepare('INSERT INTO profile (singleton) VALUES (2)').run());
    rejects(() => db.prepare("UPDATE profile SET specialization = 'offset'").run());
  });

  it('Suchindex findet Begriffe ohne Rücksicht auf Gross-/Kleinschreibung und Umlaute', () => {
    db.prepare(
      "INSERT INTO journal_fts (journal_id, title, body) VALUES ('j1', 'Möglichkeiten der Weiterverarbeitung', 'Falzen und Rillen')",
    ).run();
    expect(
      db.prepare("SELECT journal_id FROM journal_fts WHERE journal_fts MATCH 'moglichkeiten'").all(),
    ).toHaveLength(1);
  });
});

describe('Migrationen', () => {
  it('ist idempotent: zweiter Lauf ändert nichts und sichert nichts', async () => {
    const r = await migrate(db, { backupFile: () => path.join(dir, 'nie.sqlite') });
    expect(r).toEqual({ from: LATEST_VERSION, to: LATEST_VERSION, backupFile: null });
  });

  it('verweigert Dateien aus einer neueren Programmversion', async () => {
    db.exec(`PRAGMA user_version = ${LATEST_VERSION + 1}`);
    await expect(migrate(db)).rejects.toBeInstanceOf(NewerSchemaError);
  });

  it('sichert vorhandene Daten vor dem Umbau und führt neue Migrationen aus', async () => {
    insertJournal('j1');
    const v2: Migration = {
      version: LATEST_VERSION + 1,
      name: 'Test',
      up: (d) => d.exec('ALTER TABLE journal ADD COLUMN test TEXT'),
    };
    const backupFile = path.join(dir, 'vor-migration.sqlite');
    const r = await migrate(db, { migrations: [...MIGRATIONS, v2], backupFile: () => backupFile });
    expect(r.to).toBe(LATEST_VERSION + 1);
    expect(existsSync(backupFile)).toBe(true);
    // Backup ist eine vollständige, intakte Kopie im alten Stand
    const copy = openDatabase(backupFile, { readOnly: true });
    expect(getSchemaVersion(copy)).toBe(LATEST_VERSION);
    expect(copy.prepare('SELECT count(*) n FROM journal').get()).toEqual({ n: 1 });
    expect(checkIntegrity(copy)).toEqual([]);
    copy.close();
  });

  it('fehlerhafte Migration: Datei bleibt auf dem letzten gültigen Stand', async () => {
    insertJournal('j1');
    const broken: Migration = {
      version: LATEST_VERSION + 1,
      name: 'kaputt',
      up: (d) => {
        d.exec('ALTER TABLE journal ADD COLUMN halb TEXT');
        throw new Error('Absichtlicher Fehler');
      },
    };
    await expect(migrate(db, { migrations: [...MIGRATIONS, broken] })).rejects.toThrow(
      'Absichtlicher Fehler',
    );
    expect(getSchemaVersion(db)).toBe(LATEST_VERSION);
    const cols = (db.prepare('PRAGMA table_info(journal)').all() as { name: string }[]).map((c) => c.name);
    expect(cols).not.toContain('halb');
    expect(db.prepare('SELECT count(*) n FROM journal').get()).toEqual({ n: 1 });
  });

  it('Versionsnummern sind lückenlos aufsteigend', () => {
    MIGRATIONS.forEach((m, i) => expect(m.version).toBe(i + 1));
  });
});
