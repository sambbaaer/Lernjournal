// Tests: Projekt anlegen/öffnen/schliessen, Sperre, Cloud-Erkennung, Zuletzt-Liste, Pfad-Freigabe.
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Profile } from '@shared/ipc';
import { openDatabase } from '../db/connection';
import { LATEST_VERSION } from '../db/migrations';
import { BIPLA_CATEGORIES } from '@shared/bipla';
import type { Env } from './lock';
import { PathGuard } from './path-guard';
import { DB_FILE, ProjectService } from './project-service';
import { addRecent, readRecent, removeRecent, writeRecent, MAX_RECENT } from './recent';
import { detectSyncProvider } from './sync-detect';

let root: string;
const profile: Profile = {
  displayName: 'Muster Lernende',
  company: 'Druckerei AG',
  apprenticeshipStart: '2025-08-01',
  specialization: 'print',
};
const lockEnv = (pid = 100): Env => ({
  pid,
  hostname: 'PC',
  isProcessAlive: () => true,
  now: () => new Date(),
});
// Alle im Test erzeugten Dienste merken und am Ende schliessen: Unter Windows
// lässt sich ein Ordner mit geöffneter Datenbank nicht löschen (EPERM).
let opened: ProjectService[] = [];
const service = (pid = 100) => {
  const s = new ProjectService({ appVersion: '0.1.0', lockEnv: lockEnv(pid), env: {} });
  opened.push(s);
  return s;
};

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'lj-proj-'));
});
afterEach(() => {
  opened.forEach((s) => s.close());
  opened = [];
  rmSync(root, { recursive: true, force: true });
});

describe('Projekt anlegen', () => {
  it('legt Ordnerstruktur, Datenbank, Profil und Vorschlag-Kategorien an', async () => {
    const s = service();
    const dir = path.join(root, 'Mein Lernjournal');
    const r = await s.create({ dir, title: 'Lehre 2025–2029', profile, seedCategories: true });
    expect(r.status).toBe('opened');
    if (r.status !== 'opened') return;
    expect(r.project).toMatchObject({
      title: 'Lehre 2025–2029',
      profile,
      journalCount: 0,
      syncProvider: null,
    });
    for (const f of [DB_FILE, 'media', 'backups', 'exports', 'project.lock'])
      expect(existsSync(path.join(dir, f))).toBe(true);
    const cats = s.db.prepare("SELECT name FROM category WHERE source = 'bipla' ORDER BY sort_order").all();
    expect(cats).toHaveLength(BIPLA_CATEGORIES.length);
    s.close();
    expect(existsSync(path.join(dir, 'project.lock'))).toBe(false);
  });

  it('ohne Vorschlag-Kategorien: keine Kategorien', async () => {
    const s = service();
    await s.create({ dir: path.join(root, 'p'), title: 'P', profile, seedCategories: false });
    expect(s.db.prepare('SELECT count(*) n FROM category').get()).toEqual({ n: 0 });
    s.close();
  });

  it('schreibt nie in einen Ordner mit fremden Dateien oder über ein bestehendes Projekt', async () => {
    const s = service();
    const busy = path.join(root, 'voll');
    mkdirSync(busy);
    writeFileSync(path.join(busy, 'Bewerbung.docx'), 'x');
    expect(await s.create({ dir: busy, title: 'P', profile, seedCategories: false })).toEqual({
      status: 'not-allowed',
    });
    const dir = path.join(root, 'p');
    await s.create({ dir, title: 'P', profile, seedCategories: false });
    s.close();
    expect(await s.create({ dir, title: 'P2', profile, seedCategories: false })).toEqual({
      status: 'not-allowed',
    });
  });

  it('akzeptiert einen Ordner, der nur Systemdateien enthält', async () => {
    const dir = path.join(root, 'leer');
    mkdirSync(dir);
    writeFileSync(path.join(dir, 'desktop.ini'), '');
    expect(service().inspectFolder(dir).kind).toBe('empty');
  });
});

describe('Projekt öffnen', () => {
  async function prepared() {
    const dir = path.join(root, 'p');
    const s = service();
    await s.create({ dir, title: 'P', profile, seedCategories: false });
    s.close();
    return dir;
  }

  it('öffnet ein bestehendes Projekt mit seinen Daten', async () => {
    const dir = await prepared();
    const r = await service().open(dir);
    expect(r).toMatchObject({
      status: 'opened',
      project: { title: 'P', profile, migratedFromVersion: null },
    });
  });

  it('erkennt Ordner ohne Projekt', async () => {
    expect(await service().open(root)).toEqual({ status: 'not-a-project' });
  });

  it('verhindert zweites Öffnen (andere Instanz auf demselben PC)', async () => {
    const dir = await prepared();
    const a = service(100);
    await a.open(dir);
    expect(await service(200).open(dir)).toEqual({ status: 'locked-here' });
    a.close();
    expect((await service(200).open(dir)).status).toBe('opened');
  });

  it('lehnt Projekte aus einer neueren Programmversion verständlich ab und gibt die Sperre frei', async () => {
    const dir = await prepared();
    const db = openDatabase(path.join(dir, DB_FILE));
    db.exec(`PRAGMA user_version = ${LATEST_VERSION + 5}`);
    db.close();
    const r = await service().open(dir);
    expect(r.status).toBe('newer-version');
    expect(existsSync(path.join(dir, 'project.lock'))).toBe(false);
  });

  it('meldet eine beschädigte Datei statt abzustürzen', async () => {
    const dir = path.join(root, 'kaputt');
    mkdirSync(dir);
    writeFileSync(path.join(dir, DB_FILE), 'Das ist keine SQLite-Datei, sondern Text.'.repeat(200));
    const r = await service().open(dir);
    expect(r.status).toBe('corrupt');
    expect(existsSync(path.join(dir, 'project.lock'))).toBe(false);
  });

  it('Profil ändern und wieder lesen', async () => {
    const dir = await prepared();
    const s = service();
    await s.open(dir);
    const updated = s.updateProfile({ ...profile, specialization: 'printmediatechnik', company: '  ' });
    expect(updated).toMatchObject({ specialization: 'printmediatechnik', company: null });
    s.close();
    const r = await service().open(dir);
    expect(r).toMatchObject({ project: { profile: { specialization: 'printmediatechnik' } } });
  });
});

describe('Cloud-Ordner erkennen', () => {
  it('erkennt typische Synchronisationsordner', () => {
    expect(detectSyncProvider('C:\\Users\\lea\\OneDrive\\Lernjournal', {})).toBe('OneDrive');
    expect(detectSyncProvider('C:\\Users\\lea\\OneDrive - BBZB\\Lernjournal', {})).toBe('OneDrive');
    expect(detectSyncProvider('/Users/lea/Dropbox/Lehre', {})).toBe('Dropbox');
    expect(detectSyncProvider('C:\\Users\\lea\\Documents\\Lernjournal', {})).toBeNull();
    expect(detectSyncProvider('C:\\Users\\lea\\Documents\\OneDriveNotizen', {})).toBeNull();
  });
  it('nutzt die OneDrive-Umgebungsvariable auch bei umbenannten Ordnern', () => {
    const env = { OneDriveCommercial: '/home/lea/Firmenablage' };
    expect(detectSyncProvider('/home/lea/Firmenablage/Lernjournal', env)).toBe('OneDrive');
  });
});

describe('Zuletzt geöffnet', () => {
  it('neuestes zuoberst, ohne Duplikate, begrenzt', () => {
    let list = [] as ReturnType<typeof readRecent>;
    for (let i = 0; i < 15; i++)
      list = addRecent(list, { path: `C:\\P${i}`, title: `P${i}`, lastOpened: '' });
    list = addRecent(list, { path: 'c:\\p3', title: 'P3', lastOpened: '' });
    expect(list).toHaveLength(MAX_RECENT);
    expect(list[0]!.title).toBe('P3');
    expect(list.filter((r) => r.path.toLowerCase() === 'c:\\p3')).toHaveLength(1);
    expect(removeRecent(list, 'C:\\P3')).toHaveLength(MAX_RECENT - 1);
  });
  it('liest kaputte Dateien als leere Liste und schreibt atomar', () => {
    const file = path.join(root, 'recent.json');
    writeFileSync(file, '{kaputt');
    expect(readRecent(file)).toEqual([]);
    writeRecent(file, [{ path: 'C:\\A', title: 'A', lastOpened: 'x' }]);
    expect(readRecent(file)).toHaveLength(1);
  });
});

describe('Pfad-Freigabe', () => {
  it('erlaubt nur freigegebene, absolute Pfade', () => {
    const g = new PathGuard();
    const p = path.join(root, 'gewählt');
    g.allow(p);
    expect(g.isAllowed(p)).toBe(true);
    expect(g.isAllowed(path.join(root, 'anderer'))).toBe(false);
    expect(g.isAllowed(path.join(p, '..', 'gewählt'))).toBe(true);
    expect(g.isAllowed(path.join(p, '..', '..'))).toBe(false);
    expect(g.isAllowed('relativ/gewählt')).toBe(false);
  });
});
