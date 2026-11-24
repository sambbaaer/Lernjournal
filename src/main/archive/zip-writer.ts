// ZIP schreiben – nur das, was das .ajournal-Format braucht (AJ-14, ADR 0005).
//
// Ergebnis ist ein gewöhnliches ZIP, das auch der Windows-Explorer, 7-Zip und
// LibreOffice öffnen (Test: zip.test.ts liest es zusätzlich mit fflate):
//  - Namen in UTF-8 (Kennzeichen gesetzt), nur «/» als Trennzeichen
//  - Methode «gespeichert» (Bilder, schon komprimiert) oder «Deflate»
//  - CRC-32 und Grössen stehen im lokalen Kopf UND im zentralen Verzeichnis
//    (keine Datenbeschreibung nach den Daten). Weil die Grössen erst nach dem
//    Packen bekannt sind, wird der lokale Kopf danach an seiner Stelle
//    überschrieben – die Datei wird dafür positionsgenau beschrieben.
//  - kein ZIP64: Bei mehr als ARCHIVE_LIMITS.maxArchiveBytes bricht das
//    Schreiben mit verständlicher Meldung ab (weit unter der 4-GiB-Grenze).
//
// Gelesen und gepackt wird in Stücken (Streams): auch eine grosse Datenbank
// braucht wenig Arbeitsspeicher. Nebenbei entstehen die SHA-256 und die
// Grösse jeder Datei für das Manifest.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open, type FileHandle } from 'node:fs/promises';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { constants, crc32, createDeflateRaw } from 'node:zlib';
import { ARCHIVE_LIMITS, ArchiveError, type ArchiveLimits } from './archive-format';

type Written = {
  name: Buffer;
  method: 0 | 8;
  crc: number;
  compressedSize: number;
  size: number;
  offset: number;
};

export type AddedFile = { size: number; sha256: string };

const FLAG_UTF8 = 0x0800;
const VERSION = 20; // «2.0»: Deflate, Ordnerpfade – von allen Programmen lesbar

export class ZipWriter {
  private readonly written: Written[] = [];
  private offset = 0;
  private closed = false;

  private constructor(
    private readonly fh: FileHandle,
    private readonly modified: Date,
    private readonly limits: ArchiveLimits,
  ) {}

  // Neue Datei anlegen ('wx': nie eine bestehende überschreiben – der Aufrufer
  // schreibt in eine Temp-Datei und benennt sie danach um, siehe fs-atomic.ts)
  static async create(
    file: string,
    options: { modified?: Date; limits?: ArchiveLimits } = {},
  ): Promise<ZipWriter> {
    const fh = await open(file, 'wx');
    return new ZipWriter(fh, options.modified ?? new Date(), options.limits ?? ARCHIVE_LIMITS);
  }

  // Datei vom Datenträger aufnehmen (gestreamt)
  addFile(name: string, source: string, options: { compress: boolean }): Promise<AddedFile> {
    return this.add(name, createReadStream(source, { highWaterMark: 64 * 1024 }), options.compress);
  }

  // Bytes aus dem Speicher aufnehmen (Manifest)
  addBuffer(name: string, data: Uint8Array, options: { compress: boolean }): Promise<AddedFile> {
    return this.add(name, Readable.from([Buffer.from(data)]), options.compress);
  }

  private async add(name: string, source: Readable, compress: boolean): Promise<AddedFile> {
    if (this.closed) throw new Error('ZipWriter ist bereits geschlossen');
    const nameBytes = Buffer.from(name, 'utf8');
    const method = compress ? 8 : 0;
    const headerOffset = this.offset;
    // Lokaler Kopf mit Platzhaltern für CRC und Grössen (werden unten ersetzt)
    await this.write(localHeader(nameBytes, method, this.modified, 0, 0, 0));

    let size = 0;
    let crc = 0;
    const hash = createHash('sha256');
    // Zählt und prüft die UNGEPACKTEN Daten (vor dem Packen)
    const tap = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        size += chunk.length;
        crc = crc32(chunk, crc);
        hash.update(chunk);
        cb(null, chunk);
      },
    });
    const dataStart = this.offset;
    const sink = async (chunks: AsyncIterable<Buffer>) => {
      for await (const chunk of chunks) await this.write(chunk);
    };
    if (compress)
      await pipeline(source, tap, createDeflateRaw({ level: constants.Z_DEFAULT_COMPRESSION }), sink);
    else await pipeline(source, tap, sink);
    const compressedSize = this.offset - dataStart;

    // Platzhalter im lokalen Kopf ersetzen (Bytes 14–25: CRC, gepackt, entpackt)
    const sizes = Buffer.alloc(12);
    sizes.writeUInt32LE(crc >>> 0, 0);
    sizes.writeUInt32LE(compressedSize, 4);
    sizes.writeUInt32LE(size, 8);
    await this.fh.write(sizes, 0, sizes.length, headerOffset + 14);

    this.written.push({
      name: nameBytes,
      method,
      crc: crc >>> 0,
      compressedSize,
      size,
      offset: headerOffset,
    });
    return { size, sha256: hash.digest('hex') };
  }

  // Zentrales Verzeichnis und Verzeichnisende schreiben, Datei auf den
  // Datenträger zwingen und schliessen. Liefert die Grösse des Archivs.
  async close(): Promise<number> {
    if (this.closed) throw new Error('ZipWriter ist bereits geschlossen');
    if (this.written.length > 0xfffe) throw new ArchiveError('too-large', 'Zu viele Dateien für ein Archiv.');
    const cdOffset = this.offset;
    for (const w of this.written) await this.write(centralHeader(w, this.modified));
    const cdSize = this.offset - cdOffset;
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(this.written.length, 8);
    end.writeUInt16LE(this.written.length, 10);
    end.writeUInt32LE(cdSize, 12);
    end.writeUInt32LE(cdOffset, 16);
    await this.write(end);
    await this.fh.sync(); // wie synchronous=FULL: erst «fertig», wenn es auf der Platte ist
    await this.fh.close();
    this.closed = true;
    return this.offset;
  }

  // Bei einem Fehler: Datei schliessen (der Aufrufer löscht die Temp-Datei)
  async abort(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.fh.close().catch(() => {});
  }

  private async write(buf: Buffer): Promise<void> {
    if (this.offset + buf.length > this.limits.maxArchiveBytes) {
      throw new ArchiveError(
        'too-large',
        `Das Projekt ist zu gross für eine .ajournal-Datei (Grenze ${Math.round(this.limits.maxArchiveBytes / 2 ** 30)} GB).`,
      );
    }
    let done = 0;
    while (done < buf.length) {
      const { bytesWritten } = await this.fh.write(buf, done, buf.length - done, this.offset + done);
      done += bytesWritten;
    }
    this.offset += buf.length;
  }
}

// Datum und Uhrzeit im MS-DOS-Format (lokale Zeit, 2-Sekunden-Schritte, ab 1980)
function dosDateTime(d: Date): { time: number; date: number } {
  const year = Math.max(1980, d.getFullYear());
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

function localHeader(
  name: Buffer,
  method: number,
  modified: Date,
  crc: number,
  compressedSize: number,
  size: number,
): Buffer {
  const { time, date } = dosDateTime(modified);
  const h = Buffer.alloc(30 + name.length);
  h.writeUInt32LE(0x04034b50, 0);
  h.writeUInt16LE(VERSION, 4);
  h.writeUInt16LE(FLAG_UTF8, 6);
  h.writeUInt16LE(method, 8);
  h.writeUInt16LE(time, 10);
  h.writeUInt16LE(date, 12);
  h.writeUInt32LE(crc, 14);
  h.writeUInt32LE(compressedSize, 18);
  h.writeUInt32LE(size, 22);
  h.writeUInt16LE(name.length, 26);
  h.writeUInt16LE(0, 28); // keine Zusatzfelder
  name.copy(h, 30);
  return h;
}

function centralHeader(w: Written, modified: Date): Buffer {
  const { time, date } = dosDateTime(modified);
  const h = Buffer.alloc(46 + w.name.length);
  h.writeUInt32LE(0x02014b50, 0);
  h.writeUInt16LE(VERSION, 4); // erstellt mit: MS-DOS-Attribute (oberes Byte 0), Version 2.0
  h.writeUInt16LE(VERSION, 6);
  h.writeUInt16LE(FLAG_UTF8, 8);
  h.writeUInt16LE(w.method, 10);
  h.writeUInt16LE(time, 12);
  h.writeUInt16LE(date, 14);
  h.writeUInt32LE(w.crc, 16);
  h.writeUInt32LE(w.compressedSize, 20);
  h.writeUInt32LE(w.size, 24);
  h.writeUInt16LE(w.name.length, 28);
  // Zusatzfeld, Kommentar, Startdisk, interne Attribute: 0
  h.writeUInt32LE(0, 38); // externe Attribute: normale Datei
  h.writeUInt32LE(w.offset, 42);
  w.name.copy(h, 46);
  return h;
}
