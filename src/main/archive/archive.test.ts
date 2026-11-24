// Tests der Projektübergabe .ajournal (AJ-14): Export → Import mit echter
// Datenbank, Bildern, Kategorien, Schlagwörtern, Verknüpfungen und Suche;
// Manifest, Formatversionen, ältere Schemas; manipulierte Dateien (Hashes,
// Manifest, Datenbank, Bilder); Aufräumen des Zielordners; IPC-Handler.
// Angriffe auf ZIP-Ebene (ZIP-Slip, Zip-Bombe …) stehen in zip.test.ts.
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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ipcContract } from '@shared/ipc';
import { EMPTY_SECTIONS } from '@shared/journal';
import { openDatabase } from '../db/connection';
import { getSchemaVersion, LATEST_VERSION, migrate, MIGRATIONS } from '../db/migrations';
import { createIpcDispatcher, type Handlers } from '../ipc-handler';
import { OpenedProjects } from '../project/project-handlers';
import { DB_FILE, ProjectService } from '../project/project-service';
import { ARCHIVE_FORMAT_VERSION, type ArchiveErrorCode, type Manifest } from './archive-format';
import { writeProjectArchive } from './archive-export';
import { snapshotDatabase } from './archive-db';
import { createArchiveHandlers } from './archive-handlers';
import { inspectArchive, verifyArchive } from './archive-import';
import {
  contentOf,
  createSampleProject,
  HEAVY_TIMEOUT,
  newProjectService,
  PNG,
  projectServices,
  sha,
  type ProjectServices,
  whileWriting,
} from '../test-project';

// Jeder Test legt echte Projekte (Datenbank mit synchronous=FULL, Bilder)
// und Sicherungen bzw. Übergaben auf der Platte an – unter Windows dauert
// das ein Vielfaches (Begründung bei HEAVY_TIMEOUT). Gilt nur für diese Datei.
vi.setConfig({ testTimeout: HEAVY_TIMEOUT });

const NOW = new Date(2026, 10, 24, 9, 30);
// Füller-Journale zu je 4000 Zeichen für den Konsistenztest (rund 2,4 MB)
const FILLER_ROWS = 600;

let root: string;
let opened: ProjectService[] = [];
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'lj-arch-'));
});
afterEach(() => {
  opened.forEach((p) => p.close());
  opened = [];
  rmSync(root, { recursive: true, force: true });
});

// Ein Projekt samt allen Diensten (test-project.ts)
function services(projects: ProjectService) {
  return projectServices(projects, () => NOW);
}

function newService(): ProjectService {
  const p = newProjectService();
  opened.push(p);
  return p;
}

// Beispielprojekt (test-project.ts): drei Journale, Bilder, Kategorien,
// Schlagwörter, Verknüpfung und Link im Text
async function sampleProject(name = 'quelle') {
  const s = services(newService());
  const ids = await createSampleProject(s, path.join(root, name));
  return { ...s, ids };
}

function snapshotOf(s: ProjectServices) {
  return contentOf(s.projects.db);
}

async function rejects(promise: Promise<unknown>, code: ArchiveErrorCode): Promise<string> {
  const err = (await promise.then(
    () => null,
    (e: unknown) => e,
  )) as { name?: string; code?: string; message: string } | null;
  expect(err, `erwartet: ArchiveError ${code}`).not.toBeNull();
  expect(err).toMatchObject({ name: 'ArchiveError', code });
  expect(err!.message).not.toMatch(/ß/);
  return err!.message;
}

// Archiv auspacken, verändern und mit fflate neu packen (gültiges ZIP mit
// korrekten CRC – nur der Inhalt ist manipuliert). fixHashes: Manifest
// passend zum veränderten Inhalt neu berechnen (wie ein geschickter Angreifer).
function rezip(
  src: string,
  mutate: (files: Record<string, Uint8Array>, manifest: Manifest) => void,
  options: { fixHashes?: boolean; dropManifest?: boolean; rawManifest?: string } = {},
): string {
  const files = unzipSync(readFileSync(src));
  const manifest = JSON.parse(strFromU8(files['manifest.json']!)) as Manifest;
  delete files['manifest.json'];
  mutate(files, manifest);
  if (options.fixHashes)
    manifest.files = Object.entries(files).map(([p, d]) => ({ path: p, size: d.length, sha256: sha(d) }));
  if (!options.dropManifest)
    files['manifest.json'] = strToU8(options.rawManifest ?? JSON.stringify(manifest));
  const out = path.join(root, `manipuliert-${Math.random().toString(36).slice(2)}.ajournal`);
  writeFileSync(out, zipSync(files));
  return out;
}

// Datenbank im Archiv per SQL verändern
function patchDb(files: Record<string, Uint8Array>, sql: string): void {
  const tmp = path.join(root, `db-${Math.random().toString(36).slice(2)}.sqlite`);
  writeFileSync(tmp, files['journal.sqlite']!);
  const db = openDatabase(tmp, { journalMode: 'delete' });
  db.exec(sql);
  db.close();
  files['journal.sqlite'] = new Uint8Array(readFileSync(tmp));
}

async function exported() {
  const src = await sampleProject();
  const file = path.join(root, 'uebergabe.ajournal');
  const result = await src.archive.exportTo(file);
  return { src, file, result };
}

// Import über den Dienst und danach normal öffnen (wie die Handler)
async function importInto(file: string, dir = path.join(root, 'ziel')) {
  const target = services(newService());
  const outcome = await target.archive.importTo(file, dir);
  const r = await target.projects.open(dir);
  expect(r.status).toBe('opened');
  return { ...target, outcome, dir };
}

describe('Export: versioniertes ZIP mit Prüfsummen', () => {
  it('enthält Datenbank, alle Bilder und ein Manifest mit Version, Zeit, Grössen und SHA-256', async () => {
    const { src, file, result } = await exported();
    expect(result).toMatchObject({ journals: 3, media: 2, warnings: [] });
    expect(result.bytes).toBe(readFileSync(file).length);

    const zip = unzipSync(readFileSync(file)); // auch andere Programme können es lesen
    const manifest = JSON.parse(strFromU8(zip['manifest.json']!)) as Manifest;
    expect(manifest).toMatchObject({
      format: 'lernjournal-projekt',
      formatVersion: ARCHIVE_FORMAT_VERSION,
      appVersion: '0.1.0',
      schemaVersion: LATEST_VERSION,
      createdAt: NOW.toISOString(),
      project: { title: 'Lehre 2025–2029' },
      counts: { journals: 3, media: 2 },
    });
    const names = Object.keys(zip).sort();
    expect(names).toEqual(
      ['journal.sqlite', 'manifest.json', `media/${src.ids.png}.png`, `media/${src.ids.webp}.webp`].sort(),
    );
    for (const f of manifest.files) {
      expect(f.size).toBe(zip[f.path]!.length);
      expect(f.sha256).toBe(sha(zip[f.path]!));
    }
    // Bilder unverändert übernommen
    expect(sha(zip[`media/${src.ids.png}.png`]!)).toBe(sha(PNG));

    // Datenbank: eigenständige Kopie im Journalmodus DELETE (Bytes 18/19 = 1),
    // nicht die laufende WAL-Datei (dort 2)
    const dbBytes = zip['journal.sqlite']!;
    expect([dbBytes[18], dbBytes[19]]).toEqual([1, 1]);
    expect(Buffer.from(dbBytes.subarray(0, 15)).toString()).toBe('SQLite format 3');
  });

  it('enthält auch Änderungen, die nur in der WAL-Datei stehen (Online-Backup)', async () => {
    const src = await sampleProject();
    // Nach dem letzten Checkpoint gespeichert: steht nur in journal.sqlite-wal
    src.journals.create({ title: 'Gerade eben gespeichert', workDate: '2026-11-24' });
    expect(existsSync(path.join(src.projects.dir, 'journal.sqlite-wal'))).toBe(true);
    const file = path.join(root, 'neu.ajournal');
    expect((await src.archive.exportTo(file)).journals).toBe(4);
    const t = await importInto(file);
    expect(t.journals.list({ includeArchived: true }).map((j) => j.title)).toContain(
      'Gerade eben gespeichert',
    );
  });

  it('gelingt und bleibt konsistent, während dieselbe Verbindung gleichzeitig speichert (Regression AJ-15)', async () => {
    // Früher: Backup-API direkt aus der Verbindung des Programms → schrieb
    // diese während eines Kopierschritts, brach SQLite mit SQLITE_LOCKED ab.
    // Jetzt: eigene, nur lesende Verbindung, ein Schritt (archive-db.ts).
    // Zuerst die Kopie selbst, viele Male (schnell, ohne ZIP): Die alte
    // Umsetzung scheitert hier zuverlässig nach wenigen Runden. Dann eine
    // ganze Übergabe als Integrationsprobe. Bewusst knapp bemessen, weil
    // unter Windows jedes COMMIT (synchronous=FULL) auf den Datenträger wartet.
    const src = await sampleProject();
    const db = src.projects.db;
    const big = JSON.stringify({ ...EMPTY_SECTIONS, reflexion: { type: 'doc', content: [] } });
    const ins = db.prepare(
      "INSERT INTO journal (id, title, work_date, sections_json, created_at, updated_at) VALUES (?, ?, '2026-01-01', ?, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
    );
    db.exec('BEGIN');
    for (let i = 0; i < FILLER_ROWS; i++)
      ins.run(`00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, 'x'.repeat(4000), big);
    db.exec('COMMIT');
    const update = db.prepare('UPDATE journal SET title = ? WHERE id IN (?, ?)');
    const save = (n: number) => {
      db.exec('BEGIN IMMEDIATE');
      update.run(`Stand ${n}`, src.ids.a, src.ids.b);
      db.exec('COMMIT');
    };
    save(0); // Ausgangsstand: beide Titel gleich
    const sameTitles = (dbFile: string) => {
      const copy = openDatabase(dbFile, { readOnly: true });
      try {
        const t = copy.prepare('SELECT title FROM journal WHERE id IN (?, ?)').all(src.ids.a, src.ids.b) as {
          title: string;
        }[];
        expect(t[0]!.title).toBe(t[1]!.title);
      } finally {
        copy.close();
      }
    };

    // Die Kopie wiederholt sich bei «gesperrt» bis zu dreimal (archive-db.ts) –
    // das darf beim Speichern während der Kopie nie nötig sein.
    const retried = vi.spyOn(console, 'warn');
    let total = 0;
    for (let round = 0; round < 20; round++) {
      const file = path.join(root, `kopie-${round}.sqlite`);
      const { writes } = await whileWriting(db, save, () => snapshotDatabase(db, file));
      total += writes;
      sameTitles(file);
    }
    expect(total).toBeGreaterThan(0); // es wurde wirklich währenddessen gespeichert
    expect(retried).not.toHaveBeenCalled();
    retried.mockRestore();

    const file = path.join(root, 'laufend.ajournal');
    await whileWriting(db, save, () => src.archive.exportTo(file));
    const tmp = path.join(root, 'laufend.sqlite');
    writeFileSync(tmp, unzipSync(readFileSync(file))['journal.sqlite']!);
    sameTitles(tmp);
  });

  it('schreibt atomar: bei einem Fehler bleibt keine halbe Datei zurück', async () => {
    const src = await sampleProject();
    rmSync(path.join(src.projects.dir, 'media', `${src.ids.png}.png`));
    // Ordner gibt es nicht → Fehler mit verständlicher Meldung, nichts angelegt
    await rejects(src.archive.exportTo(path.join(root, 'fehlt', 'x.ajournal')), 'io');
    expect(readdirSync(root).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('meldet fehlende Bilder als Hinweis; die Datei bleibt importierbar', async () => {
    const src = await sampleProject();
    rmSync(path.join(src.projects.dir, 'media', `${src.ids.png}.png`));
    const file = path.join(root, 'ohne-bild.ajournal');
    const r = await src.archive.exportTo(file);
    expect(r.media).toBe(1);
    expect(r.warnings).toEqual([
      '1 Bild fehlt im Projektordner (Ordner «media») und ist nicht in der Datei enthalten.',
    ]);
    const t = await importInto(file);
    expect(t.outcome.warnings[0]).toContain('fehlte schon beim Export');
  });

  it('meldet Bilder, deren Inhalt nicht mehr zur gespeicherten Prüfsumme passt', async () => {
    const src = await sampleProject();
    const f = path.join(src.projects.dir, 'media', `${src.ids.png}.png`);
    const bytes = readFileSync(f);
    bytes.writeUInt8(bytes.readUInt8(bytes.length - 1) ^ 0xff, bytes.length - 1); // nach IEND – Bild bleibt lesbar
    writeFileSync(f, bytes);
    const r = await src.archive.exportTo(path.join(root, 'x.ajournal'));
    expect(r.warnings.join(' ')).toContain('stimmt nicht mehr mit seiner Prüfsumme überein');
  });

  it('speichert nicht in den Bilderordner des Projekts (würde dort aufgeräumt)', async () => {
    const src = await sampleProject();
    await rejects(src.archive.exportTo(path.join(src.projects.dir, 'media', 'x.ajournal')), 'target');
  });

  it('schlägt einen Dateinamen mit Datum und Projekttitel vor', async () => {
    const src = await sampleProject();
    expect(src.archive.suggestedName()).toBe('2026-11-24 Lehre 2025–2029.ajournal');
  });

  it('das Archiv besteht die vollständige Prüfung (verifyArchive)', async () => {
    const { file } = await exported();
    const m = await verifyArchive(file);
    expect(m.files).toHaveLength(3);
  });
});

describe('Import in ein neues Projekt', () => {
  it('Roundtrip: Journale, Bilder, Legenden, Kategorien, Schlagwörter, Links und Profil bleiben gleich', async () => {
    const { src, file } = await exported();
    const before = snapshotOf(src);
    const t = await importInto(file);
    expect(t.outcome).toMatchObject({ journals: 3, media: 2, warnings: [] });
    expect(snapshotOf(t)).toEqual(before);
    // Bilddateien identisch und über die Datenbank auflösbar
    for (const id of [src.ids.png, src.ids.webp]) {
      const found = t.media.resolve(id)!;
      expect(found.file.startsWith(path.join(t.dir, 'media'))).toBe(true);
      expect(sha(readFileSync(found.file))).toBe(sha(readFileSync(src.media.resolve(id)!.file)));
    }
    // Verknüpfungen und «Erwähnt in» funktionieren
    expect(t.links.list(src.ids.a).linked.map((l) => l.id)).toEqual([src.ids.c]);
    expect(t.links.list(src.ids.b).mentionedIn.map((l) => l.id)).toEqual([src.ids.a]);
    // Projektordner vollständig
    for (const d of [DB_FILE, 'media', 'backups', 'exports', 'project.lock'])
      expect(existsSync(path.join(t.dir, d))).toBe(true);
  });

  it('Suche funktioniert danach: Text, Wortteile, Bildlegenden, Schlagwörter, Kategorien', async () => {
    const { src, file } = await exported();
    const t = await importInto(file);
    const ids = (q: string) => t.search.search(q, { includeArchived: true }).hits.map((h) => h.id);
    expect(ids('spektralfotometer')).toContain(src.ids.a);
    expect(ids('messung')).toEqual([src.ids.a]); // Wortteil im Titel
    expect(ids('Kontrollstreifen')).toEqual([src.ids.a]); // Bildlegende
    expect(ids('Proof')).toEqual([src.ids.a]); // Schlagwort
    expect(ids('Papier')).toContain(src.ids.b);
    const cat = t.taxonomy.list().categories[0]!.name;
    expect(ids(cat.split(' ').at(-1)!)).toContain(src.ids.a);
  });

  it('das Quellprojekt bleibt unverändert; derselbe Export lässt sich mehrfach importieren', async () => {
    const { src, file } = await exported();
    const before = snapshotOf(src);
    await importInto(file, path.join(root, 'kopie-1'));
    await importInto(file, path.join(root, 'kopie-2'));
    expect(snapshotOf(src)).toEqual(before);
  });

  it('baut einen leeren oder beschädigten Suchindex neu auf', async () => {
    const { src, file } = await exported();
    const broken = rezip(file, (files) => patchDb(files, 'DELETE FROM journal_fts'), { fixHashes: true });
    const t = await importInto(broken);
    expect(t.search.search('Kontrollstreifen', { includeArchived: true }).hits.map((h) => h.id)).toEqual([
      src.ids.a,
    ]);
  });

  it('zieht ältere Schemaversionen per Migration hoch (Schema v1 → aktuell)', async () => {
    // Projektdatei, wie sie eine ältere Lernjournal-Version (Schema v1) hätte
    const dbFile = path.join(root, 'v1.sqlite');
    const db = openDatabase(dbFile, { journalMode: 'delete' });
    await migrate(db, { migrations: MIGRATIONS.slice(0, 1) });
    db.exec(`INSERT INTO project VALUES (1, 'p-1', 'Altes Projekt', '2025-08-01T08:00:00.000Z', '0.0.9');
             INSERT INTO profile (singleton, display_name) VALUES (1, 'Lea');
             INSERT INTO journal (id, title, work_date, sections_json, created_at, updated_at)
             VALUES ('6f1c1c52-7d1e-4b3e-9a51-1d2b3c4d5e6f', 'Druckmaschine reinigen', '2025-09-01',
                     '${JSON.stringify(EMPTY_SECTIONS)}',
                     '2025-09-01T08:00:00.000Z', '2025-09-01T08:00:00.000Z');`);
    expect(getSchemaVersion(db)).toBe(1);
    db.close();
    const file = path.join(root, 'alt.ajournal');
    await writeProjectArchive(file, {
      dbFile,
      media: [],
      manifest: {
        appVersion: '0.0.9',
        schemaVersion: 1,
        createdAt: '2025-12-01T10:00:00.000Z',
        project: { id: 'p-1', title: 'Altes Projekt' },
        counts: { journals: 1, media: 0 },
      },
    });
    const t = await importInto(file);
    expect(getSchemaVersion(t.projects.db)).toBe(LATEST_VERSION);
    // Trigramm-Suche (Schema v2) findet den Wortteil
    expect(t.search.search('maschine', { includeArchived: true }).hits).toHaveLength(1);
  });

  it('lehnt neuere Paketformate und neuere Schemaversionen verständlich ab', async () => {
    const { file } = await exported();
    const newerFormat = rezip(file, (_f, m) => {
      (m as { formatVersion: number }).formatVersion = ARCHIVE_FORMAT_VERSION + 1;
    });
    const msg = await rejects(inspectArchive(newerFormat), 'newer-version');
    expect(msg).toContain('Bitte Lernjournal aktualisieren');
    const newerSchema = rezip(file, (_f, m) => {
      m.schemaVersion = LATEST_VERSION + 1;
    });
    await rejects(inspectArchive(newerSchema), 'newer-version');
    // Auch wenn nur die Datenbank selbst neuer ist (Manifest gefälscht)
    const newerDb = rezip(file, (files) => patchDb(files, `PRAGMA user_version = ${LATEST_VERSION + 1}`), {
      fixHashes: true,
    });
    await rejects(importInto(newerDb), 'newer-version');
  });

  it('überschreibt nie ein bestehendes Projekt oder fremde Dateien im Zielordner', async () => {
    const { src, file } = await exported();
    const t = services(newService());
    // Quellprojekt selbst als Ziel
    await rejects(t.archive.importTo(file, src.projects.dir), 'target');
    // Ordner mit fremden Dateien
    const busy = path.join(root, 'voll');
    mkdirSync(busy);
    writeFileSync(path.join(busy, 'Bewerbung.docx'), 'wichtig');
    await rejects(t.archive.importTo(file, busy), 'target');
    expect(readdirSync(busy)).toEqual(['Bewerbung.docx']);
  });

  it('räumt den Zielordner bei einem Fehler auf (neuer Ordner weg, leerer Ordner bleibt leer)', async () => {
    const { file } = await exported();
    const bad = rezip(file, (files) => {
      const img = Object.keys(files).find((n) => n.endsWith('.webp'))!;
      files[img] = new Uint8Array(files[img]!.length); // Nullen statt Bild – Hash stimmt nicht
    });
    const t = services(newService());
    const neu = path.join(root, 'neu');
    await rejects(t.archive.importTo(bad, neu), 'checksum');
    expect(existsSync(neu)).toBe(false);

    const leer = path.join(root, 'leer');
    mkdirSync(leer);
    writeFileSync(path.join(leer, 'desktop.ini'), '[.ShellClassInfo]');
    await rejects(t.archive.importTo(bad, leer), 'checksum');
    expect(readdirSync(leer)).toEqual(['desktop.ini']);
  });
});

describe('Manipulierte Dateien werden abgelehnt', () => {
  it('falscher Hash: Bild verändert, Manifest nicht', async () => {
    const { file } = await exported();
    const bad = rezip(file, (files) => {
      const img = Object.keys(files).find((n) => n.endsWith('.png'))!;
      const changed = new Uint8Array(files[img]!);
      changed[100] = changed[100]! ^ 0xff;
      files[img] = changed;
    });
    const msg = await rejects(importInto(bad), 'checksum');
    expect(msg).toContain('Prüfsumme');
  });

  it('falscher Hash: Manifest nennt eine andere SHA-256 für die Datenbank', async () => {
    const { file } = await exported();
    const bad = rezip(file, (_f, m) => {
      m.files.find((f) => f.path === 'journal.sqlite')!.sha256 = '0'.repeat(64);
    });
    await rejects(importInto(bad), 'checksum');
  });

  it('fehlende Datei, falsche Grösse, ungelistete Datei, doppelter Eintrag im Manifest', async () => {
    const { src, file } = await exported();
    const png = `media/${src.ids.png}.png`;
    await rejects(inspectArchive(rezip(file, (files) => delete files[png])), 'checksum');
    await rejects(
      inspectArchive(
        rezip(file, (_f, m) => {
          m.files.find((f) => f.path === png)!.size += 1;
        }),
      ),
      'checksum',
    );
    const extra = `media/${'1'.repeat(8)}-1111-4111-8111-${'1'.repeat(12)}.png`;
    const msg = await rejects(
      inspectArchive(rezip(file, (files) => (files[extra] = PNG))),
      'unexpected-entry',
    );
    expect(msg).toContain('nicht im Verzeichnis');
    await rejects(inspectArchive(rezip(file, (_f, m) => m.files.push({ ...m.files[0]! }))), 'duplicate');
  });

  it('Manifest fehlt, ist kein JSON, hat eine fremde Kennung oder ist unvollständig', async () => {
    const { file } = await exported();
    await rejects(inspectArchive(rezip(file, () => {}, { dropManifest: true })), 'manifest');
    await rejects(inspectArchive(rezip(file, () => {}, { rawManifest: '{kaputt' })), 'manifest');
    await rejects(
      inspectArchive(rezip(file, () => {}, { rawManifest: '{"format":"anderes-programm"}' })),
      'manifest',
    );
    await rejects(
      inspectArchive(
        rezip(file, () => {}, { rawManifest: '{"format":"lernjournal-projekt","formatVersion":1}' }),
      ),
      'manifest',
    );
  });

  it('Bild ist keine Bilddatei (Hash passend gefälscht)', async () => {
    const { file } = await exported();
    const bad = rezip(
      file,
      (files) => {
        const img = Object.keys(files).find((n) => n.endsWith('.png'))!;
        files[img] = strToU8('<script>alert(1)</script>');
      },
      { fixHashes: true },
    );
    const msg = await rejects(importInto(bad), 'unexpected-entry');
    expect(msg).toContain('kein gültiges Bild');
  });

  it('Bild ohne Eintrag in der Datenbank', async () => {
    const { file } = await exported();
    const extra = `media/${'2'.repeat(8)}-2222-4222-8222-${'2'.repeat(12)}.png`;
    const bad = rezip(file, (files) => (files[extra] = PNG), { fixHashes: true });
    await rejects(importInto(bad), 'unexpected-entry');
  });

  it.each([
    ['zusätzlicher Trigger', 'CREATE TRIGGER boese AFTER INSERT ON journal BEGIN DELETE FROM journal; END;'],
    ['zusätzliche Tabelle', 'CREATE TABLE geheim (x)'],
    ['zusätzliche View', 'CREATE VIEW v AS SELECT * FROM journal'],
    ['entfernter Index', 'DROP INDEX journal_status'],
    ['verletzte CHECK-Regel', "PRAGMA ignore_check_constraints = ON; UPDATE journal SET status = 'gehackt'"],
    [
      'Bildpfad mit «..»',
      "PRAGMA ignore_check_constraints = ON; UPDATE media SET relative_path = 'media/../../evil.png' WHERE mime_type = 'image/png'",
    ],
    [
      'Bildpfad passt nicht zur ID',
      "UPDATE media SET relative_path = 'media/33333333-3333-4333-8333-333333333333.png' WHERE mime_type = 'image/png'",
    ],
    ['ID ist keine UUID', "INSERT INTO category (id, name) VALUES ('keine-uuid', 'Neu')"],
    ['verletzter Fremdschlüssel', "PRAGMA foreign_keys = OFF; DELETE FROM journal WHERE status = 'archived'"],
    [
      'ungültiger Journal-Inhalt',
      `UPDATE journal SET sections_json = '{"auftrag":{"type":"doc","content":[{"type":"script"}]},"durchfuehrung":{"type":"doc"},"reflexion":{"type":"doc"}}'`,
    ],
    [
      'Link mit unerlaubtem Protokoll',
      `UPDATE journal SET sections_json = replace(sections_json, 'lernjournal://journal/', 'javascript:alert(1)//')`,
    ],
    ['Projektangaben fehlen', 'DELETE FROM project'],
  ])('manipulierte Datenbank: %s', async (_label, sql) => {
    const { file } = await exported();
    const bad = rezip(file, (files) => patchDb(files, sql), { fixHashes: true });
    await rejects(importInto(bad), 'database');
  });

  it('manipulierte Datenbank: Version passt nicht zum Manifest', async () => {
    const { file } = await exported();
    const bad = rezip(file, (_f, m) => {
      m.schemaVersion = 1;
    });
    await rejects(importInto(bad), 'database');
  });

  it('Datenbank ist keine SQLite-Datei', async () => {
    const { file } = await exported();
    const bad = rezip(file, (files) => (files['journal.sqlite'] = strToU8('kein SQLite')), {
      fixHashes: true,
    });
    await rejects(importInto(bad), 'database');
  });

  it('ZIP-Slip im echten Import: nichts landet ausserhalb des Zielordners', async () => {
    const { file } = await exported();
    const bad = rezip(file, (files) => (files['../../ausserhalb.txt'] = strToU8('x')), { fixHashes: true });
    const t = services(newService());
    await rejects(t.archive.importTo(bad, path.join(root, 'ziel')), 'unsafe-name');
    expect(existsSync(path.join(root, 'ausserhalb.txt'))).toBe(false);
    expect(existsSync(path.join(root, 'ziel'))).toBe(false);
  });
});

describe('IPC: Handler und Vertrag', () => {
  async function setup() {
    const src = await sampleProject();
    const docs = path.join(root, 'Dokumente');
    mkdirSync(docs);
    const calls = { shown: [] as string[], progress: [] as string[] };
    const answers = {
      exportPath: null as string | null,
      file: null as string | null,
      folder: null as string | null,
    };
    const opened = new OpenedProjects(path.join(root, 'recent.json'));
    const handlers = createArchiveHandlers({
      service: src.archive,
      projects: src.projects,
      opened,
      documentsDir: docs,
      chooseExportPath: async () => answers.exportPath,
      chooseArchiveFile: async () => answers.file,
      chooseImportFolder: async () => answers.folder,
      showInFolder: (f) => calls.shown.push(f),
      progress: (p) => calls.progress.push(p.step),
    });
    return { src, docs, calls, answers, opened, handlers };
  }

  it('Export: abbrechen, speichern (Endung ergänzt), im Ordner anzeigen', async () => {
    const { handlers, answers, calls } = await setup();
    expect(await handlers['archive:export'](undefined)).toEqual({ status: 'canceled' });
    expect(await handlers['archive:showFile'](undefined)).toEqual({ shown: false });
    answers.exportPath = path.join(root, 'Sicherung');
    const r = await handlers['archive:export'](undefined);
    expect(r).toMatchObject({ status: 'saved', fileName: 'Sicherung.ajournal', journals: 3, media: 2 });
    expect(existsSync(path.join(root, 'Sicherung.ajournal'))).toBe(true);
    expect(calls.progress[0]).toBe('Datenbank wird gesichert …');
    expect(calls.progress).toContain('Datei wird geprüft …');
    expect(await handlers['archive:showFile'](undefined)).toEqual({ shown: true });
    expect(calls.shown).toEqual([path.join(root, 'Sicherung.ajournal')]);
  });

  it('Import: Vorschau, Vorschlag «Dokumente\\Titel», anderer Ordner, Import öffnet das neue Projekt', async () => {
    const { src, handlers, answers, docs, opened } = await setup();
    answers.exportPath = path.join(root, 'u.ajournal');
    await handlers['archive:export'](undefined);

    expect(await handlers['archive:chooseImport'](undefined)).toEqual({ status: 'canceled' });
    await expect(handlers['archive:import'](undefined)).rejects.toMatchObject({ code: 'target' });

    answers.file = path.join(root, 'u.ajournal');
    mkdirSync(path.join(docs, 'Lehre 2025–2029')); // schon vorhanden und nicht leer
    writeFileSync(path.join(docs, 'Lehre 2025–2029', 'x.txt'), 'x');
    const preview = await handlers['archive:chooseImport'](undefined);
    expect(preview).toMatchObject({
      status: 'ready',
      fileName: 'u.ajournal',
      summary: { title: 'Lehre 2025–2029', journals: 3, media: 2, appVersion: '0.1.0' },
      target: path.join(docs, 'Lehre 2025–2029 2'),
    });

    // Anderer Ordner: nicht leer → Unterordner mit dem Projekttitel
    answers.folder = root;
    expect(await handlers['archive:chooseImportTarget'](undefined)).toEqual({
      target: path.join(root, 'Lehre 2025–2029'),
    });
    // Bestehendes Projekt als Ziel: abgelehnt, Wahl bleibt
    answers.folder = src.projects.dir;
    await expect(handlers['archive:chooseImportTarget'](undefined)).rejects.toMatchObject({ code: 'target' });
    answers.folder = null; // abgebrochen: Wahl bleibt
    expect(await handlers['archive:chooseImportTarget'](undefined)).toEqual({ target: null });

    const r = await handlers['archive:import'](undefined);
    expect(r).toMatchObject({ status: 'imported', journals: 3, media: 2, warnings: [] });
    expect(r.project.path).toBe(path.join(root, 'Lehre 2025–2029'));
    expect(src.projects.dir).toBe(path.join(root, 'Lehre 2025–2029')); // jetzt geöffnet
    expect(opened.recent[0]!.path).toBe(path.join(root, 'Lehre 2025–2029'));
    expect(opened.guard.isAllowed(path.join(root, 'Lehre 2025–2029'))).toBe(true);
  });

  it('bei einem Fehler bleibt das bisherige Projekt geöffnet', async () => {
    const { src, handlers, answers } = await setup();
    answers.exportPath = path.join(root, 'u.ajournal');
    await handlers['archive:export'](undefined);
    answers.file = path.join(root, 'u.ajournal');
    await handlers['archive:chooseImport'](undefined);
    // Datei zwischen Vorschau und Import verändert → Import prüft erneut
    const bad = rezip(path.join(root, 'u.ajournal'), (files) => {
      const img = Object.keys(files).find((n) => n.endsWith('.png'))!;
      files[img] = new Uint8Array(files[img]!.length);
    });
    rmSync(path.join(root, 'u.ajournal'));
    writeFileSync(path.join(root, 'u.ajournal'), readFileSync(bad));
    const before = src.projects.dir;
    await expect(handlers['archive:import'](undefined)).rejects.toMatchObject({ code: 'checksum' });
    expect(src.projects.dir).toBe(before);
  });

  it('Vertrag: kein Befehl nimmt einen Pfad an; Fehlermeldungen kommen verständlich an', async () => {
    const { handlers, answers } = await setup();
    const all = { ...(handlers as object) } as Handlers;
    const dispatch = createIpcDispatcher(all, () => true);
    const ev = { senderFrame: { url: 'app://lernjournal/index.html' } };
    for (const channel of Object.keys(handlers)) {
      expect(ipcContract[channel as keyof typeof ipcContract].request.safeParse(undefined).success).toBe(
        true,
      );
      expect(await dispatch(channel, ev, { path: 'C:/Windows' })).toMatchObject({
        ok: false,
        error: { code: 'INVALID_REQUEST' },
      });
    }
    answers.file = path.join(root, 'gibt-es-nicht.ajournal');
    writeFileSync(answers.file, 'kein zip');
    const r = await dispatch('archive:chooseImport', ev, undefined);
    expect(r).toEqual({
      ok: false,
      error: {
        code: 'INVALID_REQUEST',
        message: 'Die Datei ist keine gültige .ajournal-Datei (kein lesbares ZIP-Archiv).',
      },
    });
  });
});
