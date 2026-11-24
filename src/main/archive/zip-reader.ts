// ZIP lesen – misstrauisch (AJ-14, ADR 0005).
//
// Eine .ajournal-Datei kommt von aussen (USB-Stick, E-Mail, anderer PC) und
// kann beschädigt oder absichtlich manipuliert sein. Darum glaubt dieser
// Leser keiner Angabe, die er nicht nachprüfen kann:
//
//  - Aufbau: Das zentrale Verzeichnis muss genau vor dem Verzeichnisende
//    liegen, jeder Eintrag einen passenden lokalen Kopf haben (gleicher Name,
//    gleiche Methode und Grössen), und keine zwei Einträge dürfen sich
//    überlappen (Trick «überlappende Dateien» mancher Zip-Bomben).
//  - Namen: keine Pfad-Traversal («../»), keine absoluten Pfade, keine
//    Laufwerksbuchstaben («C:»), keine Backslashes, keine Steuerzeichen,
//    keine doppelten Namen (auch nicht in anderer Schreibweise), keine
//    symbolischen Links. Zusätzlich lässt das Format nur die Namen aus
//    archive-format.ts zu.
//  - Grössen: Anzahl Einträge, Grösse je Datei, Summe und Kompressions-
//    verhältnis werden VOR dem Entpacken geprüft (Angaben im Verzeichnis) und
//    BEIM Entpacken nochmals – gezählt werden die tatsächlich entpackten Bytes.
//    Liefert ein Eintrag mehr als angegeben, bricht das Entpacken sofort ab.
//  - Inhalt: CRC-32 jedes Eintrags; die SHA-256 aus dem Manifest prüft der
//    Aufrufer (archive-import.ts) mit dem Wert, den dieser Leser berechnet.
//
// Bewusst NICHT unterstützt (wird abgelehnt): ZIP64, Verschlüsselung,
// mehrteilige Archive, andere Kompressionen als «gespeichert» und «Deflate».
// Das Format braucht nichts davon (ARCHIVE_LIMITS bleibt unter 4 GiB).
//
// Kein Electron, keine Bibliothek: nur node:fs, node:zlib (Inflate, CRC-32)
// und node:crypto. Gelesen wird in Stücken – auch grosse Archive brauchen
// wenig Arbeitsspeicher.
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { open, rm, type FileHandle } from 'node:fs/promises';
import { Readable, Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { crc32, createInflateRaw } from 'node:zlib';
import { ARCHIVE_LIMITS, ArchiveError, DAMAGED, maxEntryBytes, type ArchiveLimits } from './archive-format';

export type ZipEntry = {
  name: string;
  method: 0 | 8; // 0 = gespeichert, 8 = Deflate
  crc32: number;
  compressedSize: number;
  size: number; // entpackte Grösse laut Verzeichnis – beim Entpacken nachgezählt
  localHeaderOffset: number;
  dataStart: number; // erst nach Prüfung des lokalen Kopfs bekannt
};

// Signaturen der ZIP-Strukturen (PKWARE APPNOTE 6.3)
const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_END = 0x06054b50;
const SIG_ZIP64_LOCATOR = 0x07064b50;
const END_SIZE = 22;
const CENTRAL_SIZE = 46;
const LOCAL_SIZE = 30;
const MAX_COMMENT = 0xffff;
const CHUNK = 64 * 1024;

// Bits im Feld «general purpose flag»
const FLAG_ENCRYPTED = 0x0001;
const FLAG_DATA_DESCRIPTOR = 0x0008;
const FLAG_STRONG_ENCRYPTION = 0x0040;
const FLAG_UTF8 = 0x0800;
const FLAG_MASKED_HEADERS = 0x2000;

// Betriebssystem im Feld «version made by» (oberes Byte)
const HOST_MSDOS = 0;
const HOST_UNIX = 3;
const HOST_NTFS = 10;
const HOST_OSX = 19;

const utf8 = new TextDecoder('utf-8', { fatal: true });

// Warum ein Name gefährlich ist – oder null, wenn er unbedenklich ist.
// Gilt unabhängig vom Format (die Liste der erlaubten Namen kommt danach).
// Wichtig ist hier Windows: Dort sind «\» und «/» beide Trennzeichen, «C:»
// ist ein Laufwerk, «x.png:y» ein versteckter Datenstrom, und Punkte oder
// Leerzeichen am Ende eines Namens fallen stillschweigend weg.
export function unsafeNameReason(name: string): string | null {
  if (name.length === 0 || name.length > 255) return 'leerer oder zu langer Name';
  // eslint-disable-next-line no-control-regex -- Steuerzeichen bewusst suchen
  if (/[\u0000-\u001f\u007f]/.test(name)) return 'Steuerzeichen im Namen';
  if (name.includes('\\')) return 'Backslash im Pfad';
  if (name.startsWith('/')) return 'absoluter Pfad';
  if (/^[a-zA-Z]:/.test(name)) return 'Laufwerksbuchstabe';
  if (name.includes(':')) return 'Doppelpunkt im Namen';
  for (const part of name.split('/')) {
    if (part === '') return 'leerer Pfadteil';
    if (part === '.' || part === '..') return 'Pfad-Traversal («..»)';
    if (/[. ]$/.test(part)) return 'Punkt oder Leerzeichen am Ende';
    if (/^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(part)) return 'reservierter Windows-Name';
  }
  return null;
}

export class ZipReader {
  private constructor(
    private readonly fh: FileHandle,
    readonly entries: readonly ZipEntry[],
    readonly archiveBytes: number,
  ) {}

  // Öffnet ein Archiv und prüft Aufbau, Namen und Grössenangaben, ohne etwas
  // zu entpacken. Wirft ArchiveError mit verständlicher Meldung.
  static async open(file: string, limits: ArchiveLimits = ARCHIVE_LIMITS): Promise<ZipReader> {
    let fh: FileHandle;
    try {
      fh = await open(file, 'r');
    } catch {
      throw new ArchiveError(
        'io',
        'Die Datei konnte nicht gelesen werden. Ist der Datenträger noch angeschlossen?',
      );
    }
    try {
      const { entries, size } = await readDirectory(fh, limits);
      return new ZipReader(fh, entries, size);
    } catch (err) {
      await fh.close().catch(() => {});
      throw err;
    }
  }

  entry(name: string): ZipEntry | undefined {
    return this.entries.find((e) => e.name === name);
  }

  async close(): Promise<void> {
    await this.fh.close().catch(() => {});
  }

  // Eintrag vollständig in den Speicher (nur für kleine Dateien wie das Manifest)
  async readBuffer(entry: ZipEntry): Promise<{ data: Buffer; sha256: string }> {
    const chunks: Buffer[] = [];
    const sink = new Writable({
      write(chunk: Buffer, _enc, cb) {
        chunks.push(chunk);
        cb();
      },
    });
    const sha256 = await this.stream(entry, sink);
    return { data: Buffer.concat(chunks), sha256 };
  }

  // Eintrag in eine NEUE Datei entpacken ('wx': nie etwas überschreiben).
  // Bei einem Fehler wird die angefangene Datei entfernt.
  async extractTo(entry: ZipEntry, dest: string): Promise<{ sha256: string }> {
    try {
      const sha256 = await this.stream(entry, createWriteStream(dest, { flags: 'wx', flush: true }));
      return { sha256 };
    } catch (err) {
      // EEXIST: Datei gab es schon – dann gehört sie nicht uns, nicht löschen
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') await rm(dest, { force: true }).catch(() => {});
      throw err;
    }
  }

  // Nur prüfen (CRC, Länge) und SHA-256 berechnen, ohne zu schreiben – z. B.
  // um ein frisch geschriebenes Archiv vor dem Umbenennen zu kontrollieren
  async hash(entry: ZipEntry): Promise<{ sha256: string }> {
    const sink = new Writable({ write: (_c, _e, cb) => cb() });
    return { sha256: await this.stream(entry, sink) };
  }

  // Liest die gepackten Bytes, entpackt sie, zählt mit und prüft am Ende
  // Länge und CRC-32. Liefert die SHA-256 der entpackten Daten.
  private async stream(entry: ZipEntry, sink: Writable): Promise<string> {
    let written = 0;
    let crc = 0;
    const hash = createHash('sha256');
    const counter = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        written += chunk.length;
        // Nie mehr als angekündigt entpacken: Hier wird die Zip-Bombe
        // gestoppt, auch wenn die Angaben im Verzeichnis gelogen sind.
        if (written > entry.size) {
          cb(
            new ArchiveError('too-large', `${DAMAGED} (Eintrag «${entry.name}» ist grösser als angegeben.)`),
          );
          return;
        }
        crc = crc32(chunk, crc);
        hash.update(chunk);
        cb(null, chunk);
      },
    });
    const source = Readable.from(readRange(this.fh, entry.dataStart, entry.compressedSize));
    try {
      if (entry.method === 8) await pipeline(source, createInflateRaw(), counter, sink);
      else await pipeline(source, counter, sink);
    } catch (err) {
      if (err instanceof ArchiveError) throw err;
      const code = (err as NodeJS.ErrnoException).code ?? '';
      // Fehler von zlib (Z_DATA_ERROR, «unexpected end of file») = kaputte Daten
      if (code.startsWith('Z_') || code === 'ERR_ZLIB_INITIALIZATION_FAILED') {
        throw new ArchiveError('corrupt', `${DAMAGED} (Eintrag «${entry.name}» lässt sich nicht entpacken.)`);
      }
      throw err; // Schreibfehler (Platz, Rechte) gibt der Aufrufer verständlich weiter
    }
    if (written !== entry.size || crc !== entry.crc32) {
      throw new ArchiveError('corrupt', `${DAMAGED} (Eintrag «${entry.name}»: Prüfsumme oder Länge falsch.)`);
    }
    return hash.digest('hex');
  }
}

// Liest length Bytes ab start in Stücken
async function* readRange(fh: FileHandle, start: number, length: number): AsyncGenerator<Buffer> {
  let pos = start;
  let left = length;
  while (left > 0) {
    const n = Math.min(CHUNK, left);
    const buf = Buffer.allocUnsafe(n);
    const { bytesRead } = await fh.read(buf, 0, n, pos);
    if (bytesRead === 0) throw new ArchiveError('corrupt', `${DAMAGED} (Datei endet zu früh.)`);
    yield buf.subarray(0, bytesRead);
    pos += bytesRead;
    left -= bytesRead;
  }
}

async function readAt(fh: FileHandle, position: number, length: number): Promise<Buffer> {
  const buf = Buffer.alloc(length);
  const { bytesRead } = await fh.read(buf, 0, length, position);
  if (bytesRead !== length) throw new ArchiveError('corrupt', `${DAMAGED} (Datei endet zu früh.)`);
  return buf;
}

const notZip = () =>
  new ArchiveError('not-zip', 'Die Datei ist keine gültige .ajournal-Datei (kein lesbares ZIP-Archiv).');
const unsupported = (what: string) =>
  new ArchiveError('unsupported', `Die Datei verwendet eine nicht unterstützte ZIP-Funktion (${what}).`);
const tooLarge = (what: string) =>
  new ArchiveError(
    'too-large',
    `Die Datei überschreitet eine Sicherheitsgrenze (${what}) und wird nicht importiert.`,
  );

async function readDirectory(
  fh: FileHandle,
  limits: ArchiveLimits,
): Promise<{ entries: ZipEntry[]; size: number }> {
  const stat = await fh.stat();
  if (!stat.isFile()) throw notZip();
  const size = stat.size;
  if (size > limits.maxArchiveBytes) throw tooLarge('Dateigrösse');
  if (size < END_SIZE) throw notZip();

  // 1) Verzeichnisende suchen: steht in den letzten 22 Bytes + Kommentar.
  //    Rückwärts suchen und verlangen, dass der Kommentar genau bis zum
  //    Dateiende reicht (sonst wäre es eine zufällige Bytefolge).
  const tailLength = Math.min(size, END_SIZE + MAX_COMMENT);
  const tail = await readAt(fh, size - tailLength, tailLength);
  let at = -1;
  for (let i = tail.length - END_SIZE; i >= 0; i--) {
    if (tail.readUInt32LE(i) === SIG_END && i + END_SIZE + tail.readUInt16LE(i + 20) === tail.length) {
      at = i;
      break;
    }
  }
  if (at < 0) throw notZip();
  const endPos = size - tailLength + at;
  const disk = tail.readUInt16LE(at + 4);
  const cdDisk = tail.readUInt16LE(at + 6);
  const entriesOnDisk = tail.readUInt16LE(at + 8);
  const count = tail.readUInt16LE(at + 10);
  const cdSize = tail.readUInt32LE(at + 12);
  const cdOffset = tail.readUInt32LE(at + 16);
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) throw unsupported('ZIP64');
  if (endPos >= 20 && (await readAt(fh, endPos - 20, 4)).readUInt32LE(0) === SIG_ZIP64_LOCATOR)
    throw unsupported('ZIP64');
  if (disk !== 0 || cdDisk !== 0 || entriesOnDisk !== count) throw unsupported('mehrteiliges Archiv');
  if (count > limits.maxEntries) throw tooLarge('Anzahl Dateien');
  if (cdSize > limits.maxCentralDirectoryBytes) throw tooLarge('Verzeichnisgrösse');
  // Das Verzeichnis muss lückenlos vor dem Verzeichnisende stehen
  if (cdOffset + cdSize !== endPos)
    throw new ArchiveError('corrupt', `${DAMAGED} (Verzeichnis passt nicht.)`);

  // 2) Zentrales Verzeichnis lesen und jeden Eintrag prüfen
  const cd = await readAt(fh, cdOffset, cdSize);
  const entries: (ZipEntry & { nameBytes: Buffer })[] = [];
  const seen = new Set<string>();
  let total = 0;
  let p = 0;
  for (let i = 0; i < count; i++) {
    if (p + CENTRAL_SIZE > cd.length || cd.readUInt32LE(p) !== SIG_CENTRAL)
      throw new ArchiveError('corrupt', `${DAMAGED} (Verzeichniseintrag fehlerhaft.)`);
    const madeBy = cd.readUInt16LE(p + 4);
    const flags = cd.readUInt16LE(p + 8);
    const method = cd.readUInt16LE(p + 10);
    const crc = cd.readUInt32LE(p + 16);
    const compressedSize = cd.readUInt32LE(p + 20);
    const uncompressed = cd.readUInt32LE(p + 24);
    const nameLength = cd.readUInt16LE(p + 28);
    const extraLength = cd.readUInt16LE(p + 30);
    const commentLength = cd.readUInt16LE(p + 32);
    const diskStart = cd.readUInt16LE(p + 34);
    const externalAttrs = cd.readUInt32LE(p + 38);
    const localHeaderOffset = cd.readUInt32LE(p + 42);
    const next = p + CENTRAL_SIZE + nameLength + extraLength + commentLength;
    if (next > cd.length) throw new ArchiveError('corrupt', `${DAMAGED} (Verzeichniseintrag fehlerhaft.)`);
    const nameBytes = Buffer.from(cd.subarray(p + CENTRAL_SIZE, p + CENTRAL_SIZE + nameLength));
    p = next;

    if (compressedSize === 0xffffffff || uncompressed === 0xffffffff || localHeaderOffset === 0xffffffff)
      throw unsupported('ZIP64');
    if (flags & (FLAG_ENCRYPTED | FLAG_STRONG_ENCRYPTION | FLAG_MASKED_HEADERS))
      throw unsupported('Verschlüsselung');
    if (diskStart !== 0) throw unsupported('mehrteiliges Archiv');
    if (method !== 0 && method !== 8) throw unsupported(`Kompressionsmethode ${method}`);
    if (method === 0 && compressedSize !== uncompressed)
      throw new ArchiveError('corrupt', `${DAMAGED} (Grössenangaben widersprüchlich.)`);

    // Name: ohne UTF-8-Kennzeichen nur ASCII (sonst ist die Kodierung unklar
    // und derselbe Name könnte auf Windows anders aussehen als hier geprüft)
    if (!(flags & FLAG_UTF8) && nameBytes.some((b) => b >= 0x80))
      throw new ArchiveError(
        'unsafe-name',
        'Die Datei enthält einen Dateinamen mit unbekannter Zeichenkodierung.',
      );
    let name: string;
    try {
      name = utf8.decode(nameBytes);
    } catch {
      throw new ArchiveError('unsafe-name', 'Die Datei enthält einen ungültigen Dateinamen.');
    }
    const reason = unsafeNameReason(name);
    if (reason)
      throw new ArchiveError(
        'unsafe-name',
        `Die Datei enthält einen unsicheren Pfad («${printable(name)}»: ${reason}) und wird nicht importiert.`,
      );

    // Symbolische Links (Unix/macOS: Dateityp im oberen Teil der Attribute;
    // Windows: Attribut «Analysepunkt»). Lernjournal schreibt nie welche.
    const host = madeBy >> 8;
    if (host === HOST_UNIX || host === HOST_OSX) {
      const type = (externalAttrs >>> 16) & 0o170000;
      if (type === 0o120000)
        throw new ArchiveError(
          'symlink',
          `Die Datei enthält einen symbolischen Link («${printable(name)}»).`,
        );
      if (type !== 0 && type !== 0o100000)
        throw new ArchiveError(
          'unexpected-entry',
          `Die Datei enthält einen unerwarteten Eintrag («${printable(name)}»).`,
        );
    } else if ((host === HOST_MSDOS || host === HOST_NTFS) && externalAttrs & 0x400) {
      throw new ArchiveError('symlink', `Die Datei enthält einen symbolischen Link («${printable(name)}»).`);
    }

    // Nur Namen, die zum Format gehören
    const max = maxEntryBytes(name, limits);
    if (max === null)
      throw new ArchiveError(
        'unexpected-entry',
        `Die Datei enthält «${printable(name)}», das nicht zu einem Lernjournal-Projekt gehört.`,
      );

    // Doppelte Namen – auch «Media/x.png» neben «media/x.png» (Windows
    // unterscheidet Gross/Klein nicht) und Unicode-Varianten desselben Namens
    const key = name.normalize('NFC').toLowerCase();
    if (seen.has(key))
      throw new ArchiveError(
        'duplicate',
        `Die Datei enthält «${printable(name)}» mehrfach und wird nicht importiert.`,
      );
    seen.add(key);

    // Grenzen laut Verzeichnis (beim Entpacken wird nochmals nachgezählt)
    if (uncompressed > max) throw tooLarge(`Datei «${printable(name)}» zu gross`);
    total += uncompressed;
    if (total > limits.maxTotalBytes) throw tooLarge('Gesamtgrösse entpackt');
    if (
      uncompressed >= limits.minRatioCheckBytes &&
      uncompressed > Math.max(compressedSize, 1) * limits.maxCompressionRatio
    )
      throw tooLarge(`Kompressionsverhältnis von «${printable(name)}»`);

    entries.push({
      name,
      nameBytes,
      method,
      crc32: crc,
      compressedSize,
      size: uncompressed,
      localHeaderOffset,
      dataStart: -1,
    });
  }
  if (p !== cd.length) throw new ArchiveError('corrupt', `${DAMAGED} (Verzeichnis passt nicht.)`);

  // 3) Lokale Köpfe: müssen zum Verzeichnis passen. Sonst zeigte ein anderes
  //    Programm (z. B. Windows-Explorer, der die lokalen Köpfe liest) andere
  //    Dateien als die, die hier geprüft wurden.
  for (const e of entries) {
    if (e.localHeaderOffset + LOCAL_SIZE + e.nameBytes.length > cdOffset)
      throw new ArchiveError('corrupt', `${DAMAGED} (Eintrag «${printable(e.name)}» ausserhalb der Daten.)`);
    const h = await readAt(fh, e.localHeaderOffset, LOCAL_SIZE + e.nameBytes.length);
    const mismatch = new ArchiveError(
      'corrupt',
      `${DAMAGED} (Eintrag «${printable(e.name)}» widersprüchlich.)`,
    );
    if (h.readUInt32LE(0) !== SIG_LOCAL) throw mismatch;
    const flags = h.readUInt16LE(6);
    if (flags & (FLAG_ENCRYPTED | FLAG_STRONG_ENCRYPTION)) throw unsupported('Verschlüsselung');
    if (h.readUInt16LE(8) !== e.method) throw mismatch;
    if (!(flags & FLAG_DATA_DESCRIPTOR)) {
      // Ohne Datenbeschreibung stehen CRC und Grössen auch im lokalen Kopf
      if (
        h.readUInt32LE(14) !== e.crc32 ||
        h.readUInt32LE(18) !== e.compressedSize ||
        h.readUInt32LE(22) !== e.size
      )
        throw mismatch;
    }
    if (h.readUInt16LE(26) !== e.nameBytes.length || !h.subarray(LOCAL_SIZE).equals(e.nameBytes))
      throw mismatch;
    e.dataStart = e.localHeaderOffset + LOCAL_SIZE + e.nameBytes.length + h.readUInt16LE(28);
    if (e.dataStart + e.compressedSize > cdOffset)
      throw new ArchiveError('corrupt', `${DAMAGED} (Eintrag «${printable(e.name)}» ausserhalb der Daten.)`);
  }

  // 4) Keine Überlappungen: Jeder Eintrag endet, bevor der nächste beginnt
  const sorted = [...entries].sort((a, b) => a.localHeaderOffset - b.localHeaderOffset);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    if (prev.dataStart + prev.compressedSize > sorted[i]!.localHeaderOffset)
      throw new ArchiveError('corrupt', `${DAMAGED} (Einträge überlappen sich.)`);
  }

  return { entries: entries.map(({ nameBytes: _n, ...e }) => e), size };
}

// Namen aus fremden Dateien nur gekürzt in Meldungen übernehmen
function printable(name: string): string {
  // eslint-disable-next-line no-control-regex -- Steuerzeichen nicht in die Meldung
  const clean = name.replace(/[\u0000-\u001f\u007f]/g, '?');
  return clean.length > 80 ? `${clean.slice(0, 77)}…` : clean;
}
