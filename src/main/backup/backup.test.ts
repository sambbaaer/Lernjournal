// Tests der Sicherungen (AJ-15) mit echter Datenbank und echten Bildern:
// Inhalt und Konsistenz (auch während gespeichert wird und mit Änderungen nur
// in der WAL-Datei), «unverändert», Rotation mit Bildvorrat, verstellte Uhr,
// Wiederherstellung als neues Lernjournal und durch Ersetzen (mit
// Sicherheitskopie vorher), beschädigte Sicherungen, ältere Schemas (Sicherung
// vor Update), automatische Zeitpunkte, Aufräumen, IPC-Handler und Vertrag.
// Reine Regeln: rotation.test.ts (Rotation), src/shared/backup.test.ts (Erinnerung).
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BACKUP_TEXTS, EXPORT_REMINDER } from '@shared/backup';
import { ipcContract } from '@shared/ipc';
import { EMPTY_SECTIONS } from '@shared/journal';
import { checkIntegrity, openDatabase, transaction } from '../db/connection';
import { getSchemaVersion, LATEST_VERSION, migrate, MIGRATIONS } from '../db/migrations';
import { createIpcDispatcher, type Handlers } from '../ipc-handler';
import { createProjectHandlers, OpenedProjects } from '../project/project-handlers';
import { DB_FILE, type ProjectService } from '../project/project-service';
import {
  contentOf,
  createSampleProject,
  doc,
  newProjectService,
  paragraph,
  PNG,
  projectServices,
  sha,
} from '../test-project';
import { BackupError, type BackupErrorCode, type BackupManifest } from './backup-format';
import { createBackupHandlers } from './backup-handlers';
import { BackupService } from './backup-service';
import { backupFile, listBackups, poolDir } from './backup-store';

const START = new Date(2026, 10, 24, 9, 30); // 24.11.2026, 09:30 Ortszeit
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

let root: string;
let opened: ProjectService[] = [];
let clock: Date;
const advance = (ms: number) => (clock = new Date(clock.getTime() + ms));

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'lj-backup-'));
  clock = START;
});
afterEach(() => {
  opened.forEach((p) => p.close());
  opened = [];
  rmSync(root, { recursive: true, force: true });
});

// Projekt mit allen Diensten und Sicherungen, wie in src/main/index.ts verdrahtet
function world(policy?: { keepLatest: number; keepMonths: number }) {
  const projects = newProjectService({
    now: () => clock,
    afterOpen: () => backups.afterOpen(),
    beforeClose: () => backups.beforeClose(),
  });
  opened.push(projects);
  const backups = new BackupService({
    projects,
    appVersion: '0.1.0',
    now: () => clock,
    policy: policy ? { ...policy, intervalMs: DAY } : undefined,
  });
  return { ...projectServices(projects, () => clock), backups };
}
type World = ReturnType<typeof world>;

async function sample(name = 'quelle', policy?: Parameters<typeof world>[0]) {
  const w = world(policy);
  const dir = path.join(root, name);
  const ids = await createSampleProject(w, dir);
  return { ...w, ids, dir };
}

// Etwas ändern, Uhr vorstellen, von Hand sichern → ID der neuen Sicherung
async function changeAndBackup(w: World, title: string, step = HOUR): Promise<string> {
  const j = w.journals.create({ title, workDate: '2026-11-24' });
  expect(j.id).toBeTruthy();
  advance(step);
  const r = await w.backups.backupNow();
  expect(r.status).toBe('created');
  return r.backup.id;
}

// Ein Byte umkippen (Datenträgerfehler nachstellen)
const flip = (bytes: Uint8Array, at: number) => {
  bytes[at] = bytes[at]! ^ 0xff;
};
const ids = async (dir: string) => (await listBackups(dir)).map((b) => b.id);
const titles = (w: World) =>
  w.journals
    .list({ includeArchived: true })
    .map((j) => j.title)
    .sort();

function readZip(file: string) {
  const files = unzipSync(readFileSync(file));
  return { files, manifest: JSON.parse(strFromU8(files['manifest.json']!)) as BackupManifest };
}

// Datenbank aus einer Sicherung in eine Datei entpacken und öffnen
function openBackupDb(file: string) {
  const out = path.join(root, `db-${Math.random().toString(36).slice(2)}.sqlite`);
  writeFileSync(out, readZip(file).files['journal.sqlite']!);
  return openDatabase(out, { readOnly: true });
}

async function rejects(promise: Promise<unknown>, code: BackupErrorCode): Promise<string> {
  const err = (await promise.then(
    () => null,
    (e: unknown) => e,
  )) as { name?: string; code?: string; message: string } | null;
  expect(err, `erwartet: BackupError ${code}`).not.toBeNull();
  expect(err).toMatchObject({ name: 'BackupError', code });
  expect(err!.message).not.toMatch(/ß/);
  return err!.message;
}

describe('Sicherung anlegen', () => {
  it('enthält eine eigenständige Datenbank (ohne WAL, ohne Suchindex), Manifest und alle Bilder im Vorrat', async () => {
    const w = await sample();
    const r = await w.backups.backupNow();
    expect(r.status).toBe('created');
    expect(r.backup.id).toBe('sicherung-' + START.toISOString().replace(/[:.]/g, '-'));
    const file = backupFile(w.dir, r.backup.id);
    const { files, manifest } = readZip(file);
    expect(Object.keys(files).sort()).toEqual(['journal.sqlite', 'manifest.json']);
    expect(manifest).toMatchObject({
      format: 'lernjournal-sicherung',
      formatVersion: 1,
      appVersion: '0.1.0',
      schemaVersion: LATEST_VERSION,
      createdAt: START.toISOString(),
      reason: 'manuell',
      project: { title: 'Lehre 2025–2029' },
      counts: { journals: 3, media: 2 },
      missingMedia: 0,
    });
    expect(manifest.recentTitles).toHaveLength(3);
    expect(manifest.database.sha256).toBe(sha(files['journal.sqlite']!));
    // Journalmodus DELETE (Bytes 18/19 = 1), nicht die laufende WAL-Datei (2)
    const dbBytes = files['journal.sqlite']!;
    expect([dbBytes[18], dbBytes[19]]).toEqual([1, 1]);
    const copy = openBackupDb(file);
    expect(checkIntegrity(copy)).toEqual([]);
    expect(copy.prepare('SELECT count(*) AS n FROM journal_fts').get()).toEqual({ n: 0 });
    copy.close();
    // Bilder: im Vorrat, unverändert, genau die der Datenbank
    expect(manifest.media.map((m) => m.path).sort()).toEqual(
      [`media/${w.ids.png}.png`, `media/${w.ids.webp}.webp`].sort(),
    );
    expect(sha(readFileSync(path.join(poolDir(w.dir), `${w.ids.png}.png`)))).toBe(sha(PNG));
  });

  it('enthält Änderungen, die erst in der WAL-Datei stehen (Online-Backup)', async () => {
    const w = await sample();
    w.journals.create({ title: 'Gerade eben gespeichert', workDate: '2026-11-24' });
    expect(existsSync(path.join(w.dir, 'journal.sqlite-wal'))).toBe(true);
    const r = await w.backups.backupNow();
    const copy = openBackupDb(backupFile(w.dir, r.backup.id));
    expect(
      copy.prepare("SELECT count(*) AS n FROM journal WHERE title = 'Gerade eben gespeichert'").get(),
    ).toEqual({ n: 1 });
    copy.close();
  });

  it('ohne Änderung keine neue Sicherung («unverändert»), nach einer Änderung schon', async () => {
    const w = await sample();
    const first = await w.backups.backupNow();
    advance(HOUR);
    const again = await w.backups.backupNow();
    expect(again).toMatchObject({ status: 'unchanged', backup: { id: first.backup.id } });
    w.journals.create({ title: 'Neues Journal', workDate: '2026-11-24' });
    advance(HOUR);
    expect((await w.backups.backupNow()).status).toBe('created');
    expect(await ids(w.dir)).toHaveLength(2);
  });

  it('bleibt konsistent, während gleichzeitig gespeichert wird', async () => {
    const w = await sample();
    const db = w.projects.db;
    // Grössere Datenbank, damit die Backup-API in mehreren Schritten kopiert
    const filler = JSON.stringify({ ...EMPTY_SECTIONS, durchfuehrung: doc(paragraph('x'.repeat(4000))) });
    const ins = db.prepare(
      "INSERT INTO journal (id, title, work_date, sections_json, created_at, updated_at) VALUES (?, ?, '2026-01-01', ?, ?, ?)",
    );
    transaction(db, () => {
      for (let i = 0; i < 1500; i++) {
        const id = `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
        ins.run(id, `Füller ${i}`, filler, START.toISOString(), START.toISOString());
      }
    });
    // Jede Transaktion setzt zwei Journale auf denselben Stand und legt eines an:
    // In einer konsistenten Kopie sind die beiden Titel immer gleich.
    const pair = db.prepare('UPDATE journal SET title = ? WHERE id = ?');
    let writes = 0;
    let done = false;
    const writer = (async () => {
      while (!done) {
        await new Promise((r) => setImmediate(r));
        writes++;
        transaction(db, () => {
          pair.run(`Stand ${writes}`, w.ids.a);
          pair.run(`Stand ${writes}`, w.ids.b);
          ins.run(
            `11111111-0000-4000-8000-${String(writes).padStart(12, '0')}`,
            `Neu ${writes}`,
            JSON.stringify(EMPTY_SECTIONS),
            START.toISOString(),
            START.toISOString(),
          );
        });
      }
    })();
    const r = await w.backups.backupNow().finally(async () => {
      done = true;
      await writer;
    });
    expect(writes).toBeGreaterThan(0);

    const copy = openBackupDb(backupFile(w.dir, r.backup.id));
    expect(checkIntegrity(copy)).toEqual([]);
    const t = (id: string) =>
      (copy.prepare('SELECT title FROM journal WHERE id = ?').get(id) as { title: string }).title;
    expect(t(w.ids.a)).toBe(t(w.ids.b));
    const added = (
      copy.prepare("SELECT count(*) AS n FROM journal WHERE title LIKE 'Neu %'").get() as { n: number }
    ).n;
    // Stand N gehört zu genau N neuen Journalen (oder Ausgangsstand ohne Änderung)
    expect(t(w.ids.a)).toBe(added === 0 ? 'Farbmessung am Druckbogen' : `Stand ${added}`);
    copy.close();
  });

  it('fehlt ein Bild im Projekt, wird trotzdem gesichert und das Bild gezählt', async () => {
    const w = await sample();
    rmSync(path.join(w.dir, 'media', `${w.ids.png}.png`));
    const r = await w.backups.backupNow();
    const { manifest } = readZip(backupFile(w.dir, r.backup.id));
    expect(manifest.missingMedia).toBe(1);
    expect(manifest.media.map((m) => m.path)).toEqual([`media/${w.ids.webp}.webp`]);
  });

  it('nimmt kein beschädigtes Bild in den Vorrat auf', async () => {
    const w = await sample();
    const f = path.join(w.dir, 'media', `${w.ids.png}.png`);
    const bytes = readFileSync(f);
    flip(bytes, bytes.length - 1);
    writeFileSync(f, bytes);
    const r = await w.backups.backupNow();
    expect(readZip(backupFile(w.dir, r.backup.id)).manifest.missingMedia).toBe(1);
    expect(existsSync(path.join(poolDir(w.dir), `${w.ids.png}.png`))).toBe(false);
  });

  it('Fehler beim Sichern: verständliche Meldung, automatische Sicherung merkt sich den Fehler', async () => {
    const w = await sample();
    rmSync(path.join(w.dir, 'backups'), { recursive: true });
    writeFileSync(path.join(w.dir, 'backups'), 'kein Ordner');
    await expect(w.backups.backupNow()).rejects.toBeInstanceOf(Error);
    await w.backups.beforeClose();
    expect(w.backups.lastError).toMatch(/Sicherung/);
    // Danach wieder in Ordnung: Fehler verschwindet
    rmSync(path.join(w.dir, 'backups'));
    mkdirSync(path.join(w.dir, 'backups'));
    await w.backups.backupNow();
    expect(w.backups.lastError).toBeNull();
  });
});

describe('Rotation', () => {
  it('behält die letzten 10 und je Monat die neueste Sicherung; Bilder ohne Verweis verschwinden aus dem Vorrat', async () => {
    clock = new Date(2026, 8, 3, 10); // September
    const w = await sample();
    const extra = w.journals.create({ title: 'Mit eigenem Bild', workDate: '2026-09-03' });
    const img = w.media.add({ journalId: extra.id, data: PNG, originalName: 'Extra.png' });
    const sept1 = (await w.backups.backupNow()).backup.id;
    const sept2 = await changeAndBackup(w, 'September 2');
    w.journals.delete(extra.id); // Bild verschwindet aus dem Projekt
    const sept3 = await changeAndBackup(w, 'September 3'); // neueste im September
    clock = new Date(2026, 9, 5, 10); // Oktober
    const oct1 = await changeAndBackup(w, 'Oktober 1');
    const oct2 = await changeAndBackup(w, 'Oktober 2');
    clock = new Date(2026, 10, 1, 10); // November
    const nov: string[] = [];
    for (let i = 1; i <= 12; i++) nov.push(await changeAndBackup(w, `November ${i}`));

    const kept = await ids(w.dir);
    expect(kept).toHaveLength(12);
    expect(kept).toEqual([...nov.slice(2).reverse(), oct2, sept3]);
    for (const gone of [sept1, sept2, oct1, nov[0], nov[1]]) expect(kept).not.toContain(gone);
    // Bild nur noch in gelöschten Sicherungen → aus dem Vorrat entfernt
    expect(existsSync(path.join(poolDir(w.dir), `${img.id}.png`))).toBe(false);
    expect(existsSync(path.join(poolDir(w.dir), `${w.ids.png}.png`))).toBe(true);
  });

  it('verstellte Uhr: eine neue Sicherung mit älterem Datum wird nicht gleich wieder gelöscht', async () => {
    // Kleine Aufbewahrung, damit die «älteste» Sicherung sonst sicher wegfiele
    const w = await sample('quelle', { keepLatest: 3, keepMonths: 1 });
    for (let i = 1; i <= 4; i++) await changeAndBackup(w, `Stand ${i}`);
    clock = new Date(2020, 0, 1, 12); // Uhr weit zurückgestellt
    const back = await changeAndBackup(w, 'Nach Uhrverstellung');
    expect(await ids(w.dir)).toContain(back);
    expect(await ids(w.dir)).toHaveLength(4);
    // Gleicher Zeitpunkt nochmals → eigene ID, nichts überschrieben
    w.journals.create({ title: 'Noch einer', workDate: '2026-11-24' });
    const same = await w.backups.backupNow();
    expect(same.backup.id).toBe(`${back}-1`);
    expect(await ids(w.dir)).toContain(same.backup.id);
  });

  it('räumt den Bildvorrat nicht auf, solange eine Sicherung unlesbar ist', async () => {
    const w = await sample();
    const extra = w.journals.create({ title: 'Mit Bild', workDate: '2026-11-24' });
    const img = w.media.add({ journalId: extra.id, data: PNG, originalName: 'x.png' });
    await changeAndBackup(w, 'Eins');
    w.journals.delete(extra.id);
    for (let i = 0; i < 9; i++) await changeAndBackup(w, `Stand ${i}`);
    const all = await ids(w.dir);
    writeFileSync(backupFile(w.dir, all[3]!), 'kaputt'); // eine der verbleibenden
    for (let i = 0; i < 3; i++) await changeAndBackup(w, `Mehr ${i}`);
    expect(existsSync(path.join(poolDir(w.dir), `${img.id}.png`))).toBe(true);
  });
});

describe('Wiederherstellen als neues Lernjournal', () => {
  it('Roundtrip: Journale, Bilder, Legenden, Kategorien, Schlagwörter, Links und Suche wie zum Zeitpunkt der Sicherung', async () => {
    const w = await sample();
    const before = contentOf(w.projects.db);
    const { backup } = await w.backups.backupNow();
    // Danach: Journal mit beiden Bildern gelöscht (Bilddateien weg), neues angelegt
    w.journals.delete(w.ids.a);
    w.journals.create({ title: 'Nach der Sicherung', workDate: '2026-11-24' });
    expect(existsSync(path.join(w.dir, 'media', `${w.ids.png}.png`))).toBe(false);

    const preview = await w.backups.preview(backup.id);
    expect(preview).toMatchObject({
      journals: 3,
      media: 2,
      missingMedia: 0,
      reason: 'manuell',
      current: { journals: 3, media: 0 },
    });
    expect(preview.recentTitles).toContain('Farbmessung am Druckbogen');

    const target = path.join(root, 'wiederhergestellt');
    const r = await w.backups.restoreAsNew(backup.id, target);
    expect(r).toMatchObject({ journals: 3, media: 2, warnings: [], safetyBackupId: null });

    const t = world();
    expect((await t.projects.open(target)).status).toBe('opened');
    await t.backups.idle();
    expect(contentOf(t.projects.db)).toEqual(before);
    for (const id of [w.ids.png, w.ids.webp]) expect(t.media.resolve(id)).not.toBeNull();
    expect(sha(readFileSync(t.media.resolve(w.ids.png)!.file))).toBe(sha(PNG));
    const hit = (q: string) => t.search.search(q, { includeArchived: true }).hits.map((h) => h.id);
    expect(hit('messung')).toContain(w.ids.a); // Wortteil
    expect(hit('Kontrollstreifen')).toContain(w.ids.a); // Bildlegende
    expect(hit('Spektralfotometer')).toContain(w.ids.a); // Schlagwort
    expect(checkIntegrity(t.projects.db)).toEqual([]);
    // Das bisherige Projekt bleibt, wie es war
    expect(titles(w)).toContain('Nach der Sicherung');
  });

  it('nimmt ein Bild aus dem Projekt, wenn die Kopie im Vorrat beschädigt ist; fehlt beides → Hinweis', async () => {
    const w = await sample();
    const { backup } = await w.backups.backupNow();
    const pooled = path.join(poolDir(w.dir), `${w.ids.png}.png`);
    writeFileSync(pooled, 'kaputt');
    expect((await w.backups.preview(backup.id)).missingMedia).toBe(0); // Projekt hat es noch
    rmSync(path.join(w.dir, 'media', `${w.ids.png}.png`));
    expect((await w.backups.preview(backup.id)).missingMedia).toBe(1);
    const r = await w.backups.restoreAsNew(backup.id, path.join(root, 'neu'));
    expect(r.media).toBe(2);
    expect(r.warnings[0]).toMatch(/1 Bild war in der Sicherung nicht mehr unversehrt/);
  });

  it('nur in einen neuen oder leeren Ordner; bei einem Fehler wird aufgeräumt', async () => {
    const w = await sample();
    const { backup } = await w.backups.backupNow();
    const full = path.join(root, 'voll');
    mkdirSync(full);
    writeFileSync(path.join(full, 'fremd.txt'), 'x');
    await rejects(w.backups.restoreAsNew(backup.id, full), 'target');
    expect(readdirSync(full)).toEqual(['fremd.txt']);
    // Beschädigte Datenbank in der Sicherung → neuer Ordner wieder entfernt
    const file = backupFile(w.dir, backup.id);
    const { files, manifest } = readZip(file);
    flip(files['journal.sqlite']!, 200);
    files['manifest.json'] = strToU8(JSON.stringify(manifest));
    writeFileSync(file, zipSync(files));
    const target = path.join(root, 'neu');
    await rejects(w.backups.restoreAsNew(backup.id, target), 'damaged');
    expect(existsSync(target)).toBe(false);
  });

  it('Sicherung vor einem Update (älteres Schema) lässt sich wiederherstellen', async () => {
    // Projekt im Stand Schema v2, wie es eine ältere Version angelegt hat
    const dir = path.join(root, 'alt');
    mkdirSync(path.join(dir, 'media'), { recursive: true });
    const old = openDatabase(path.join(dir, DB_FILE));
    await migrate(old, { migrations: MIGRATIONS.slice(0, 2) });
    const ts = START.toISOString();
    old.exec(
      `INSERT INTO project VALUES (1, '0b8a1f8e-1c1d-4e5f-8a9b-0c1d2e3f4a5b', 'Altes Projekt', '${ts}', '0.0.9')`,
    );
    old.exec("INSERT INTO profile (singleton, display_name) VALUES (1, 'Lea')");
    old
      .prepare(
        'INSERT INTO journal (id, title, work_date, sections_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(
        '7d4b1a2c-3e4f-4a5b-8c6d-7e8f9a0b1c2d',
        'Aus alter Zeit',
        '2026-01-10',
        JSON.stringify(EMPTY_SECTIONS),
        ts,
        ts,
      );
    old.close();

    const w = world();
    const r = await w.projects.open(dir);
    expect(r).toMatchObject({ status: 'opened', project: { migratedFromVersion: 2 } });
    await w.backups.idle();
    const list = await listBackups(dir);
    const pre = list.find((b) => b.manifest?.reason === 'vor-update')!;
    expect(pre.manifest).toMatchObject({ schemaVersion: 2, counts: { journals: 1 } });
    // Erscheint wie jede andere Sicherung und lässt sich wiederherstellen (Migration)
    const target = path.join(root, 'aus-vor-update');
    await w.backups.restoreAsNew(pre.id, target);
    const t = world();
    await t.projects.open(target);
    expect(getSchemaVersion(t.projects.db)).toBe(LATEST_VERSION);
    expect(titles(t)).toEqual(['Aus alter Zeit']);
    // Keine alten Einzeldateien «vor-update-format-…» mehr
    expect(readdirSync(path.join(dir, 'backups')).filter((f) => f.endsWith('.sqlite'))).toEqual([]);
  });
});

describe('Aktuelles Lernjournal ersetzen', () => {
  it('sichert vorher den aktuellen Stand; beide Stände lassen sich wiederherstellen', async () => {
    const w = await sample();
    const atBackup = contentOf(w.projects.db);
    const { backup } = await w.backups.backupNow();
    advance(HOUR);
    w.journals.create({ title: 'Neu nach der Sicherung', workDate: '2026-11-24' });
    w.journals.delete(w.ids.c);
    w.taxonomy.setJournalTags(w.ids.b, ['Falz']);
    const beforeRestore = contentOf(w.projects.db);

    advance(HOUR);
    const r = await w.backups.restoreReplace(backup.id);
    expect(r).toMatchObject({ journals: 3, media: 2, warnings: [] });
    expect(r.opened.project.path).toBe(w.dir);
    expect(w.projects.isOpen).toBe(true);
    expect(contentOf(w.projects.db)).toEqual(atBackup);
    expect(checkIntegrity(w.projects.db)).toEqual([]);
    expect(w.search.search('Laufrichtung', { includeArchived: true }).hits.length).toBeGreaterThan(0);

    // Sicherheitskopie: Anlass, Inhalt = Stand vor der Wiederherstellung
    const list = await listBackups(w.dir);
    const safety = list.find((b) => b.id === r.safetyBackupId)!;
    expect(safety.manifest).toMatchObject({ reason: 'vor-wiederherstellung', counts: { journals: 3 } });
    expect(safety.manifest!.recentTitles).toContain('Neu nach der Sicherung');
    // Keine zusätzliche Sicherung «beim Öffnen» direkt nach dem Ersetzen
    await w.backups.idle();
    expect((await listBackups(w.dir)).map((b) => b.manifest?.reason)).toEqual([
      'vor-wiederherstellung',
      'manuell',
    ]);
    // Keine Reste
    expect(readdirSync(path.join(w.dir, 'backups')).filter((n) => n.startsWith('.'))).toEqual([]);
    expect(existsSync(path.join(w.dir, 'project.lock'))).toBe(true);

    // Zurück zum Stand vor der Wiederherstellung
    advance(HOUR);
    await w.backups.restoreReplace(r.safetyBackupId!);
    expect(contentOf(w.projects.db)).toEqual(beforeRestore);
  });

  it('Ohne Änderung seit der letzten Sicherung dient diese als Sicherheitskopie', async () => {
    const w = await sample();
    const first = await w.backups.backupNow();
    const second = await changeAndBackup(w, 'Zweiter Stand');
    const r = await w.backups.restoreReplace(first.backup.id);
    // Aktueller Stand = «Zweiter Stand» war schon gesichert → keine neue Kopie
    expect(r.safetyBackupId).toBe(second);
    expect(await ids(w.dir)).toHaveLength(2);
  });

  it('übernimmt Zeitpunkt der letzten Übergabe und «Später erinnern» vom aktuellen Projekt', async () => {
    const w = await sample();
    const { backup } = await w.backups.backupNow();
    advance(DAY);
    await w.archive.exportTo(path.join(root, 'stick.ajournal'));
    const exportedAt = w.projects.info().lastExportAt;
    expect(exportedAt).toBe(clock.toISOString());
    const until = w.projects.snoozeExportReminder(EXPORT_REMINDER.snoozeDays);
    advance(HOUR);
    await w.backups.restoreReplace(backup.id);
    expect(w.projects.info()).toMatchObject({ lastExportAt: exportedAt, exportReminderUntil: until });
  });

  it('beschädigte Sicherung wird erkannt und nicht wiederhergestellt – das Projekt bleibt unverändert', async () => {
    const w = await sample();
    const { backup } = await w.backups.backupNow();
    w.journals.create({ title: 'Bleibt erhalten', workDate: '2026-11-24' });
    const current = contentOf(w.projects.db);
    const file = backupFile(w.dir, backup.id);
    const original = readFileSync(file);
    const expectUnchanged = async () => {
      expect(w.projects.isOpen).toBe(true);
      expect(contentOf(w.projects.db)).toEqual(current);
      expect(readdirSync(path.join(w.dir, 'backups')).filter((n) => n.startsWith('.'))).toEqual([]);
    };

    // a) Datenbank verändert, Prüfsumme im Manifest nicht → schon die Vorschau lehnt ab
    const { files, manifest } = readZip(file);
    flip(files['journal.sqlite']!, 300);
    files['manifest.json'] = strToU8(JSON.stringify(manifest));
    writeFileSync(file, zipSync(files));
    expect(await rejects(w.backups.preview(backup.id), 'damaged')).toBe(BACKUP_TEXTS.damaged);
    await rejects(w.backups.restoreReplace(backup.id), 'damaged');
    await expectUnchanged();
    expect(await ids(w.dir)).toEqual([backup.id]); // keine Sicherheitskopie nötig gewesen

    // b) abgeschnitten → in der Liste als beschädigt
    writeFileSync(file, original.subarray(0, original.length - 50));
    expect((await w.backups.list()).backups[0]).toMatchObject({ id: backup.id, damaged: true, reason: null });
    await rejects(w.backups.restoreReplace(backup.id), 'damaged');
    await expectUnchanged();

    // c) Datenbank gezielt verändert UND Prüfsumme angepasst: fällt bei der
    //    Prüfung der Datenbank auf (zusätzliche Tabelle)
    const tampered = unzipSync(original);
    const dbFile = path.join(root, 'manipuliert.sqlite');
    writeFileSync(dbFile, tampered['journal.sqlite']!);
    const m = openDatabase(dbFile, { journalMode: 'delete' });
    m.exec('CREATE TABLE boese (x)');
    m.close();
    tampered['journal.sqlite'] = new Uint8Array(readFileSync(dbFile));
    const man = JSON.parse(strFromU8(tampered['manifest.json']!)) as BackupManifest;
    man.database = { size: tampered['journal.sqlite'].length, sha256: sha(tampered['journal.sqlite']) };
    tampered['manifest.json'] = strToU8(JSON.stringify(man));
    writeFileSync(file, zipSync(tampered));
    await rejects(w.backups.restoreReplace(backup.id), 'damaged');
    await expectUnchanged();
  });

  it('unbekannte oder verschwundene Sicherung', async () => {
    const w = await sample();
    await rejects(w.backups.preview('sicherung-2020-01-01T00-00-00-000Z'), 'not-found');
    await rejects(w.backups.restoreReplace('sicherung-2020-01-01T00-00-00-000Z'), 'not-found');
  });
});

describe('Automatische Sicherungen', () => {
  it('beim Schliessen nach Änderungen, beim Öffnen nur bei geändertem Inhalt (auch nach Absturz)', async () => {
    const w = await sample();
    await w.projects.closeGracefully(); // neues Projekt mit Inhalt → Sicherung
    expect((await listBackups(w.dir)).map((b) => b.manifest?.reason)).toEqual(['schliessen']);

    advance(HOUR);
    await w.projects.open(w.dir);
    await w.backups.idle();
    await w.projects.closeGracefully(); // nichts geändert → keine neue
    expect(await ids(w.dir)).toHaveLength(1);

    // Absturz: geändert, aber ohne Sicherung beim Schliessen beendet
    advance(HOUR);
    await w.projects.open(w.dir);
    w.journals.create({ title: 'Vor dem Absturz', workDate: '2026-11-24' });
    w.projects.close();
    advance(HOUR);
    await w.projects.open(w.dir);
    await w.backups.idle();
    const list = await listBackups(w.dir);
    expect(list.map((b) => b.manifest?.reason)).toEqual(['oeffnen', 'schliessen']);
    expect(list[0]!.manifest!.recentTitles[0]).toBe('Vor dem Absturz');
  });

  it('täglich: nur nach Änderungen und wenn die neueste Sicherung mindestens 24 h alt ist', async () => {
    const w = await sample();
    await w.backups.backupNow();
    w.journals.create({ title: 'Änderung', workDate: '2026-11-24' });
    advance(23 * HOUR);
    await w.backups.tick();
    expect(await ids(w.dir)).toHaveLength(1);
    advance(HOUR); // genau 24 h
    await w.backups.tick();
    const list = await listBackups(w.dir);
    expect(list.map((b) => b.manifest?.reason)).toEqual(['taeglich', 'manuell']);
    advance(2 * DAY); // ohne Änderung → keine
    await w.backups.tick();
    expect(await ids(w.dir)).toHaveLength(2);
    // Uhr zurückgestellt (neueste Sicherung «in der Zukunft») → nach Änderung fällig
    clock = new Date(START.getTime() - 3 * DAY);
    w.journals.create({ title: 'Nach Uhrverstellung', workDate: '2026-11-24' });
    await w.backups.tick();
    expect(await ids(w.dir)).toHaveLength(3);
  });

  it('entfernt beim Öffnen Reste abgebrochener Sicherungen', async () => {
    const w = await sample();
    await w.backups.backupNow();
    await w.projects.closeGracefully();
    const b = path.join(w.dir, 'backups');
    writeFileSync(path.join(b, '.sicherung-x.zip.1234abcd.tmp'), 'halb');
    writeFileSync(path.join(poolDir(w.dir), '.y.png.1234abcd.tmp'), 'halb');
    mkdirSync(path.join(b, '.wiederherstellung-abc'));
    await w.projects.open(w.dir);
    await w.backups.idle();
    expect(readdirSync(b).filter((n) => n.startsWith('.'))).toEqual([]);
    expect(readdirSync(poolDir(w.dir)).filter((n) => n.startsWith('.'))).toEqual([]);
  });
});

describe('IPC: Handler und Vertrag', () => {
  function handlers(w: World) {
    const opened = new OpenedProjects(path.join(root, 'recent.json'));
    const docs = path.join(root, 'Dokumente');
    const folder: { next: string | null } = { next: null };
    const progress: unknown[] = [];
    const h = {
      ...createBackupHandlers({
        service: w.backups,
        projects: w.projects,
        opened,
        documentsDir: docs,
        chooseRestoreFolder: async () => folder.next,
        progress: (p) => progress.push(p),
      }),
      ...createProjectHandlers({
        service: w.projects,
        opened,
        recentFile: path.join(root, 'recent.json'),
        documentsDir: docs,
        chooseFolder: async () => null,
      }),
    } as unknown as Handlers;
    const dispatch = createIpcDispatcher(h, () => true);
    const call = (channel: string, req?: unknown) =>
      dispatch(channel, { senderFrame: { url: 'app://lernjournal/index.html' } }, req) as Promise<
        { ok: true; data: never } | { ok: false; error: { code: string; message: string } }
      >;
    return { call, folder, progress, docs, opened };
  }

  it('Liste, Jetzt sichern, Vorschau mit Zielordner-Vorschlag, anderer Ordner, Wiederherstellen als neues Lernjournal', async () => {
    const w = await sample();
    const { call, folder, docs, opened } = handlers(w);
    const created = await call('backup:create');
    expect(created).toMatchObject({
      ok: true,
      data: { status: 'created', backup: { reason: 'manuell', journals: 3 } },
    });
    const id = (created as { data: { backup: { id: string } } }).data.backup.id;
    expect(await call('backup:create')).toMatchObject({ ok: true, data: { status: 'unchanged' } });
    expect(await call('backup:list')).toMatchObject({
      ok: true,
      data: { backups: [{ id, damaged: false }], lastError: null },
    });

    const preview = await call('backup:preview', { id });
    expect(preview).toMatchObject({
      ok: true,
      data: { id, journals: 3, target: path.join(docs, 'Lehre 2025–2029 (Stand 2026-11-24)') },
    });
    // Anderer Ordner: abgebrochen → bleibt; nicht leer → Unterordner; Projekt → abgelehnt
    expect(await call('backup:chooseRestoreTarget', { id })).toMatchObject({
      ok: true,
      data: { target: null },
    });
    const other = path.join(root, 'anderswo');
    mkdirSync(other);
    writeFileSync(path.join(other, 'x.txt'), 'x');
    folder.next = other;
    expect(await call('backup:chooseRestoreTarget', { id })).toMatchObject({
      ok: true,
      data: { target: path.join(other, 'Lehre 2025–2029 (Stand 2026-11-24)') },
    });
    folder.next = w.dir;
    expect(await call('backup:chooseRestoreTarget', { id })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_REQUEST', message: expect.stringContaining('bereits ein Lernjournal') },
    });

    const restored = await call('backup:restore', { id, mode: 'new' });
    expect(restored).toMatchObject({
      ok: true,
      data: { status: 'restored', mode: 'new', journals: 3, media: 2, safetyBackup: null },
    });
    const project = (restored as { data: { project: { path: string } } }).data.project;
    expect(project.path).toBe(path.join(other, 'Lehre 2025–2029 (Stand 2026-11-24)'));
    expect(w.projects.dir).toBe(project.path);
    expect(opened.recent[0]!.path).toBe(project.path);
  });

  it('Ersetzen liefert die Sicherheitskopie; Fehler kommen verständlich an', async () => {
    const w = await sample();
    const { call } = handlers(w);
    const id = (await w.backups.backupNow()).backup.id;
    w.journals.create({ title: 'Danach', workDate: '2026-11-24' });
    advance(HOUR);
    const r = await call('backup:restore', { id, mode: 'replace' });
    expect(r).toMatchObject({
      ok: true,
      data: {
        mode: 'replace',
        project: { path: w.dir },
        safetyBackup: { reason: 'vor-wiederherstellung', journals: 4 },
      },
    });
    // «als neues» ohne vorherige Vorschau → Hinweis statt Pfad aus dem Nichts
    expect(await call('backup:restore', { id, mode: 'new' })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_REQUEST', message: expect.stringContaining('nochmals wählen') },
    });
    expect(await call('backup:preview', { id: 'sicherung-2020-01-01T00-00-00-000Z' })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_REQUEST', message: expect.stringContaining('gibt es nicht mehr') },
    });
  });

  it('Vertrag: keine Pfade, nur IDs nach Muster; «Später erinnern»', async () => {
    for (const ch of ['backup:list', 'backup:create'] as const)
      expect(ipcContract[ch].request.safeParse(undefined).success).toBe(true);
    const preview = ipcContract['backup:preview'].request;
    for (const bad of [
      '../journal.sqlite',
      'sicherung-2026-11-24T08-30-00-000Z/../../x',
      'C:\\Windows\\x',
      'sicherung-2026-11-24T08-30-00-000Z.zip',
      '',
    ])
      expect(preview.safeParse({ id: bad }).success, bad).toBe(false);
    expect(preview.safeParse({ id: 'sicherung-2026-11-24T08-30-00-000Z', path: 'C:\\x' }).success).toBe(true);
    expect(preview.parse({ id: 'sicherung-2026-11-24T08-30-00-000Z', path: 'C:\\x' })).toEqual({
      id: 'sicherung-2026-11-24T08-30-00-000Z',
    });
    expect(
      ipcContract['backup:restore'].request.safeParse({
        id: 'sicherung-2026-11-24T08-30-00-000Z',
        mode: 'merge',
      }).success,
    ).toBe(false);

    const w = await sample();
    const { call } = handlers(w);
    expect(await call('backup:preview', { id: '../x' })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_REQUEST', message: 'Ungültige Daten' },
    });
    const snoozed = await call('project:snoozeExportReminder');
    expect(snoozed).toMatchObject({
      ok: true,
      data: {
        exportReminderUntil: new Date(clock.getTime() + EXPORT_REMINDER.snoozeDays * DAY).toISOString(),
      },
    });
    expect(w.projects.info().exportReminderUntil).toBe(
      (snoozed as { data: { exportReminderUntil: string } }).data.exportReminderUntil,
    );
  });

  it('BackupError geht mit Meldung an die Oberfläche', () => {
    expect(new BackupError('damaged', 'x').name).toBe('BackupError');
  });
});

describe('Schema v3 und Zeitpunkt der letzten Übergabe', () => {
  it('Migration v2 → v3: Daten bleiben, neue Spalten leer; ungültige Zeitpunkte abgelehnt', async () => {
    const db = openDatabase(path.join(root, 'v2.sqlite'));
    await migrate(db, { migrations: MIGRATIONS.slice(0, 2) });
    db.exec(`INSERT INTO project VALUES (1, 'p', 'Titel', '${START.toISOString()}', '0.0.9')`);
    await migrate(db);
    expect(getSchemaVersion(db)).toBe(LATEST_VERSION);
    expect(
      db.prepare('SELECT title, last_export_at, export_reminder_snoozed_until FROM project').get(),
    ).toEqual({
      title: 'Titel',
      last_export_at: null,
      export_reminder_snoozed_until: null,
    });
    expect(() => db.prepare("UPDATE project SET last_export_at = 'gestern'").run()).toThrow(/CHECK/);
    db.prepare('UPDATE project SET last_export_at = ?').run(START.toISOString());
    expect(checkIntegrity(db)).toEqual([]);
    db.close();
  });

  it('Übergabe speichert den Zeitpunkt und hebt «Später erinnern» auf; Import zählt als Übergabe', async () => {
    const w = await sample();
    expect(w.projects.info()).toMatchObject({ lastExportAt: null, exportReminderUntil: null });
    w.projects.snoozeExportReminder(7);
    advance(DAY);
    const file = path.join(root, 'stick.ajournal');
    const r = await w.archive.exportTo(file);
    expect(r.lastExportAt).toBe(clock.toISOString());
    expect(w.projects.info()).toMatchObject({ lastExportAt: clock.toISOString(), exportReminderUntil: null });

    advance(10 * DAY);
    const t = world();
    await t.archive.importTo(file, path.join(root, 'zweiter-pc'));
    await t.projects.open(path.join(root, 'zweiter-pc'));
    expect(t.projects.info().lastExportAt).toBe(clock.toISOString());
  });
});
