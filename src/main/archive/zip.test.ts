// Angriffs- und Grundtests des ZIP-Lesers und -Schreibers (AJ-14).
//
// Abnahme laut Backlog: ZIP-Slip, Zip-Bombe, falsche Prüfsummen. Hier auf
// ZIP-Ebene (zip-reader.ts/zip-writer.ts); Manifest, Datenbank und der ganze
// Import stehen in archive.test.ts. Die bösartigen Dateien baut rawZip()
// (test-zip.ts) bzw. fflate (darf beliebige Namen schreiben).
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { strFromU8, unzipSync, zipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ARCHIVE_LIMITS, type ArchiveErrorCode, type ArchiveLimits } from './archive-format';
import { rawZip, type RawEntry } from './test-zip';
import { unsafeNameReason, ZipReader } from './zip-reader';
import { ZipWriter } from './zip-writer';

let root: string;
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'lj-zip-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const IMG = 'media/0b7e2f4c-1a2b-4c3d-8e9f-0123456789ab.png';
const file = (name: string, data: Uint8Array | string) => {
  const f = path.join(root, name);
  writeFileSync(f, data);
  return f;
};
const zipFile = (entries: RawEntry[], options?: Parameters<typeof rawZip>[1]) =>
  file('test.ajournal', rawZip(entries, options));
const limits = (over: Partial<ArchiveLimits>): ArchiveLimits => ({ ...ARCHIVE_LIMITS, ...over });

// Erwartet einen ArchiveError mit diesem Code (Meldung auf Deutsch, ohne ß)
async function rejects(promise: Promise<unknown>, code: ArchiveErrorCode): Promise<string> {
  const err = (await promise.then(
    () => null,
    (e: unknown) => e,
  )) as { name?: string; code?: string; message: string } | null;
  expect(err, `erwartet: ArchiveError ${code}`).not.toBeNull();
  expect(err!.name).toBe('ArchiveError');
  expect(err!.code).toBe(code);
  expect(err!.message).not.toMatch(/ß/);
  return err!.message;
}

describe('ZipWriter und ZipReader', () => {
  it('schreiben und lesen ein Archiv; fflate (wie andere Programme) liest es auch', async () => {
    const big = randomBytes(300_000);
    const src = file('db.bin', big);
    const target = path.join(root, 'a.zip');
    const w = await ZipWriter.create(target, { modified: new Date(2026, 10, 24, 9, 30, 10) });
    const db = await w.addFile('journal.sqlite', src, { compress: true });
    const img = await w.addBuffer(IMG, Buffer.from('bild'), { compress: false });
    await w.addBuffer('manifest.json', Buffer.from('{"ä":"ö"}'), { compress: true });
    const bytes = await w.close();
    expect(bytes).toBe(readFileSync(target).length);
    expect(db.size).toBe(300_000);
    expect(img.sha256).toMatch(/^[0-9a-f]{64}$/);

    const viaFflate = unzipSync(readFileSync(target));
    expect(Object.keys(viaFflate)).toEqual(['journal.sqlite', IMG, 'manifest.json']);
    expect(Buffer.from(viaFflate['journal.sqlite']!).equals(big)).toBe(true);
    expect(strFromU8(viaFflate['manifest.json']!)).toBe('{"ä":"ö"}');

    const r = await ZipReader.open(target);
    expect(r.entries.map((e) => [e.name, e.method, e.size])).toEqual([
      ['journal.sqlite', 8, 300_000],
      [IMG, 0, 4],
      ['manifest.json', 8, 11], // UTF-8: ä und ö je 2 Bytes
    ]);
    expect((await r.readBuffer(r.entry('manifest.json')!)).data.toString()).toBe('{"ä":"ö"}');
    const out = path.join(root, 'out.bin');
    const { sha256 } = await r.extractTo(r.entry('journal.sqlite')!, out);
    expect(sha256).toBe(db.sha256);
    expect(readFileSync(out).equals(big)).toBe(true);
    // Entpacken überschreibt nie eine vorhandene Datei
    await expect(r.extractTo(r.entry('journal.sqlite')!, out)).rejects.toMatchObject({ code: 'EEXIST' });
    expect(readFileSync(out).equals(big)).toBe(true);
    await r.close();
  });

  it('liest Archive anderer Programme mit erlaubten Namen (fflate)', async () => {
    const f = file(
      'fremd.zip',
      zipSync({
        'journal.sqlite': new Uint8Array([1, 2, 3]),
        'manifest.json': [new Uint8Array([123, 125]), { level: 9 }],
      }),
    );
    const r = await ZipReader.open(f);
    expect(r.entries.map((e) => e.name).sort()).toEqual(['journal.sqlite', 'manifest.json']);
    await r.close();
  });

  it('schreibt nie über eine bestehende Datei (ZipWriter.create)', async () => {
    const f = file('da.zip', 'alt');
    await expect(ZipWriter.create(f)).rejects.toMatchObject({ code: 'EEXIST' });
    expect(readFileSync(f, 'utf8')).toBe('alt');
  });

  it('bricht ab, wenn das Archiv die Grössengrenze überschreiten würde', async () => {
    const w = await ZipWriter.create(path.join(root, 'gross.zip'), {
      limits: limits({ maxArchiveBytes: 1000 }),
    });
    await expect(w.addBuffer('journal.sqlite', randomBytes(5000), { compress: false })).rejects.toMatchObject(
      {
        code: 'too-large',
      },
    );
    await w.abort();
  });
});

describe('ZIP-Slip: unsichere Namen', () => {
  it.each([
    ['../evil.txt', 'Pfad-Traversal'],
    ['media/../../evil.png', 'Pfad-Traversal'],
    ['./journal.sqlite', 'Pfad-Traversal'],
    ['/etc/passwd', 'absoluter Pfad'],
    ['C:/Windows/evil.dll', 'Laufwerksbuchstabe'],
    ['c:evil', 'Laufwerksbuchstabe'],
    ['media\\..\\..\\evil.png', 'Backslash'],
    ['\\\\server\\freigabe\\x', 'Backslash'],
    ['media//x.png', 'leerer Pfadteil'],
    ['media/', 'leerer Pfadteil'],
    ['journal.sqlite:versteckt', 'Doppelpunkt'],
    ['media/x.png.', 'Punkt oder Leerzeichen'],
    ['media/x.png ', 'Punkt oder Leerzeichen'],
    ['media/CON.png', 'reservierter Windows-Name'],
    ['aux', 'reservierter Windows-Name'],
    ['media/x\u0000.png', 'Steuerzeichen'],
    ['', 'leer'],
  ])('«%s» → %s', (name, reason) => {
    expect(unsafeNameReason(name)).toContain(reason);
  });

  it('lässt normale Namen zu', () => {
    for (const n of ['journal.sqlite', 'manifest.json', IMG, 'media/Bild 1.png', 'a/b/c.txt'])
      expect(unsafeNameReason(n)).toBeNull();
  });

  it.each([
    '../evil.txt',
    '../../../../tmp/evil.txt',
    '/tmp/evil.txt',
    'C:/Users/Public/evil.txt',
    'media\\..\\..\\evil.txt',
  ])('lehnt ein Archiv mit «%s» ab, bevor etwas entpackt wird', async (name) => {
    const f = file(
      'slip.ajournal',
      zipSync({ 'journal.sqlite': new Uint8Array([1]), [name]: new Uint8Array([66]) }),
    );
    const message = await rejects(ZipReader.open(f), 'unsafe-name');
    expect(message).toContain('unsicheren Pfad');
    expect(existsSync(path.join(root, '..', 'evil.txt'))).toBe(false);
    expect(readdirSync(root).sort()).toEqual(['slip.ajournal']);
  });

  it('lehnt symbolische Links ab (Unix-Attribute)', async () => {
    const f = zipFile([
      { name: IMG, data: Buffer.from('/etc/passwd'), madeBy: (3 << 8) | 20, externalAttrs: 0o120777 << 16 },
    ]);
    await rejects(ZipReader.open(f), 'symlink');
  });

  it('lehnt Windows-Analysepunkte (Symlink/Junction) ab', async () => {
    const f = zipFile([{ name: IMG, data: Buffer.from('x'), madeBy: (10 << 8) | 20, externalAttrs: 0x400 }]);
    await rejects(ZipReader.open(f), 'symlink');
  });

  it('lehnt Gerätedateien und Ordner-Einträge ab', async () => {
    await rejects(
      ZipReader.open(
        zipFile([{ name: IMG, data: Buffer.alloc(0), madeBy: (3 << 8) | 20, externalAttrs: 0o040755 << 16 }]),
      ),
      'unexpected-entry',
    );
    await rejects(ZipReader.open(zipFile([{ name: 'media/', data: Buffer.alloc(0) }])), 'unsafe-name');
  });

  it('lehnt Namen ohne UTF-8-Kennzeichen mit Sonderzeichen ab (Kodierung unklar)', async () => {
    const f = zipFile([
      { name: 'x', rawName: Buffer.from([0x6d, 0x84, 0x2e, 0x70]), data: Buffer.from('x'), flags: 0 },
    ]);
    await rejects(ZipReader.open(f), 'unsafe-name');
  });

  it('lehnt ungültiges UTF-8 im Namen ab', async () => {
    const f = zipFile([{ name: 'x', rawName: Buffer.from([0x6d, 0xc3, 0x28]), data: Buffer.from('x') }]);
    await rejects(ZipReader.open(f), 'unsafe-name');
  });

  it('lässt nur Dateien des Formats zu', async () => {
    for (const name of [
      'evil.exe',
      'media/x.exe',
      'media/x.png',
      'backups/a.sqlite',
      'journal.sqlite-wal',
      'Manifest.json',
    ])
      await rejects(ZipReader.open(zipFile([{ name, data: Buffer.from('x') }])), 'unexpected-entry');
  });

  it('lehnt doppelte Einträge ab', async () => {
    const f = zipFile([
      { name: 'journal.sqlite', data: Buffer.from('gut') },
      { name: 'journal.sqlite', data: Buffer.from('böse') },
    ]);
    await rejects(ZipReader.open(f), 'duplicate');
  });
});

describe('Zip-Bombe', () => {
  it('erkennt ein extremes Kompressionsverhältnis schon im Verzeichnis', async () => {
    const f = zipFile([{ name: 'journal.sqlite', data: Buffer.alloc(30 * 1024 * 1024), compress: true }]);
    const message = await rejects(ZipReader.open(f), 'too-large');
    expect(message).toContain('Kompressionsverhältnis');
  });

  it('glaubt der Grössenangabe nicht: entpackt nie mehr als angegeben', async () => {
    // Verzeichnis behauptet 1000 Bytes, die Daten ergeben 20 MB Nullen
    const f = zipFile([
      { name: 'journal.sqlite', data: Buffer.alloc(20 * 1024 * 1024), compress: true, declaredSize: 1000 },
    ]);
    const r = await ZipReader.open(f); // Angaben sehen harmlos aus
    const out = path.join(root, 'out.sqlite');
    const message = await rejects(r.extractTo(r.entry('journal.sqlite')!, out), 'too-large');
    expect(message).toContain('grösser als angegeben');
    expect(existsSync(out)).toBe(false); // angefangene Datei wieder entfernt
    await rejects(r.readBuffer(r.entry('journal.sqlite')!), 'too-large');
    await r.close();
  });

  it('begrenzt die Anzahl Einträge', async () => {
    const entries = Array.from({ length: 6 }, (_, i) => ({
      name: `media/0b7e2f4c-1a2b-4c3d-8e9f-01234567890${i}.png`,
      data: Buffer.from('x'),
    }));
    await rejects(ZipReader.open(zipFile(entries), limits({ maxEntries: 5 })), 'too-large');
    const ok = await ZipReader.open(zipFile(entries), limits({ maxEntries: 6 }));
    await ok.close();
  });

  it('begrenzt die Grösse einer Datei je nach Art', async () => {
    const f = zipFile([{ name: IMG, data: randomBytes(2000) }]);
    await rejects(ZipReader.open(f, limits({ maxMediaBytes: 1999 })), 'too-large');
    await rejects(
      ZipReader.open(
        zipFile([{ name: 'manifest.json', data: randomBytes(2000) }]),
        limits({ maxManifestBytes: 100 }),
      ),
      'too-large',
    );
  });

  it('begrenzt die Gesamtgrösse entpackt', async () => {
    const f = zipFile([
      { name: 'journal.sqlite', data: randomBytes(600) },
      { name: IMG, data: randomBytes(600) },
    ]);
    const message = await rejects(ZipReader.open(f, limits({ maxTotalBytes: 1000 })), 'too-large');
    expect(message).toContain('Gesamtgrösse');
  });

  it('begrenzt die Grösse der Archivdatei', async () => {
    const f = zipFile([{ name: 'journal.sqlite', data: randomBytes(2000) }]);
    await rejects(ZipReader.open(f, limits({ maxArchiveBytes: 1000 })), 'too-large');
  });

  it('erkennt überlappende Einträge (Trick der «besseren Zip-Bombe»)', async () => {
    const f = zipFile([
      { name: 'manifest.json', data: Buffer.from('{}'), extraCompressed: 40 },
      { name: 'journal.sqlite', data: Buffer.from('daten') },
    ]);
    const message = await rejects(ZipReader.open(f), 'corrupt');
    expect(message).toContain('überlappen');
  });
});

describe('Beschädigte und manipulierte Archive', () => {
  it('lehnt Dateien ab, die kein ZIP sind', async () => {
    await rejects(ZipReader.open(file('leer.ajournal', Buffer.alloc(0))), 'not-zip');
    await rejects(ZipReader.open(file('text.ajournal', 'Hallo Welt, kein ZIP')), 'not-zip');
    await rejects(ZipReader.open(file('zufall.ajournal', randomBytes(5000))), 'not-zip');
    await rejects(ZipReader.open(path.join(root, 'fehlt.ajournal')), 'io');
  });

  it('lehnt abgeschnittene Archive ab', async () => {
    const full = rawZip([{ name: 'journal.sqlite', data: randomBytes(5000) }]);
    await rejects(ZipReader.open(file('kurz.ajournal', full.subarray(0, full.length - 10))), 'not-zip');
    await rejects(ZipReader.open(file('ohne-anfang.ajournal', full.subarray(100))), 'corrupt');
  });

  it('erkennt eine falsche CRC-32 beim Entpacken', async () => {
    const f = zipFile([{ name: 'journal.sqlite', data: Buffer.from('daten'), crc: 0x12345678 }]);
    const r = await ZipReader.open(f);
    await rejects(r.hash(r.entry('journal.sqlite')!), 'corrupt');
    await r.close();
  });

  it('erkennt veränderte Bytes (Deflate-Daten kaputt)', async () => {
    const buf = rawZip([{ name: 'journal.sqlite', data: randomBytes(20_000), compress: true }]);
    buf.writeUInt16LE(buf.readUInt16LE(200) ^ 0xffff, 200);
    const r = await ZipReader.open(file('kaputt.ajournal', buf));
    await rejects(r.hash(r.entry('journal.sqlite')!), 'corrupt');
    await r.close();
  });

  it('erkennt einen anderen Namen im lokalen Kopf als im Verzeichnis', async () => {
    const f = zipFile([{ name: 'journal.sqlite', localName: '../evil.sqlite', data: Buffer.from('x') }]);
    await rejects(ZipReader.open(f), 'corrupt');
  });

  it('lehnt versteckte Daten zwischen Verzeichnis und Verzeichnisende ab', async () => {
    const f = zipFile([{ name: 'journal.sqlite', data: Buffer.from('x') }], {
      gapBeforeEnd: Buffer.from('versteckt'),
    });
    await rejects(ZipReader.open(f), 'corrupt');
  });

  it.each([
    ['Verschlüsselung', { flags: 0x0801 }],
    ['starke Verschlüsselung', { flags: 0x0841 }],
    ['andere Kompression (bzip2)', { method: 12 }],
  ] as const)('lehnt %s ab', async (_label, over) => {
    await rejects(
      ZipReader.open(zipFile([{ name: 'journal.sqlite', data: Buffer.from('x'), ...over }])),
      'unsupported',
    );
  });

  it('lehnt ZIP64 ab (Format bleibt bewusst unter 4 GiB)', async () => {
    const f = zipFile([{ name: 'journal.sqlite', data: Buffer.from('x') }], { zip64Locator: true });
    await rejects(ZipReader.open(f), 'unsupported');
  });

  it('lehnt «gespeichert» mit widersprüchlichen Grössen ab', async () => {
    const f = zipFile([{ name: 'journal.sqlite', data: Buffer.from('xyz'), declaredSize: 99 }]);
    await rejects(ZipReader.open(f), 'corrupt');
  });
});
