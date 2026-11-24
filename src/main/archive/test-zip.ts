// Nur für Tests: baut ZIP-Dateien «von Hand», auch absichtlich falsche
// (gelogene Grössen, falsche CRC, Symlinks, verschlüsselt markiert …), um
// die Angriffstests in zip.test.ts und archive.test.ts zu schreiben. Echte
// Werkzeuge wie fflate weigern sich zu Recht, solche Dateien zu erzeugen.
import { crc32, deflateRawSync } from 'node:zlib';

export type RawEntry = {
  name: string;
  data: Uint8Array; // entpackter Inhalt
  compress?: boolean;
  // Absichtliche Abweichungen («Lügen») für Angriffstests
  declaredSize?: number; // entpackte Grösse in den Köpfen
  extraCompressed?: number; // gepackte Grösse um so viele Bytes zu gross angeben (Überlappung)
  crc?: number;
  method?: number;
  flags?: number;
  madeBy?: number;
  externalAttrs?: number;
  localName?: string; // anderer Name im lokalen Kopf als im Verzeichnis
  rawName?: Buffer; // Namensbytes direkt (z. B. ohne UTF-8)
};

export function rawZip(
  entries: RawEntry[],
  options: { zip64Locator?: boolean; gapBeforeEnd?: Buffer } = {},
): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const data = Buffer.from(e.data);
    const packed = e.compress ? deflateRawSync(data) : data;
    const method = e.method ?? (e.compress ? 8 : 0);
    const flags = e.flags ?? 0x0800;
    const crc = e.crc ?? crc32(data);
    const size = e.declaredSize ?? data.length;
    const csize = packed.length + (e.extraCompressed ?? 0);
    const name = e.rawName ?? Buffer.from(e.name, 'utf8');
    const localName = e.localName ? Buffer.from(e.localName, 'utf8') : name;
    const usize = method === 0 && e.extraCompressed ? csize : size;

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(flags, 6);
    lh.writeUInt16LE(method, 8);
    lh.writeUInt32LE(crc >>> 0, 14);
    lh.writeUInt32LE(csize, 18);
    lh.writeUInt32LE(usize, 22);
    lh.writeUInt16LE(localName.length, 26);
    parts.push(lh, localName, packed);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(e.madeBy ?? 20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(flags, 8);
    ch.writeUInt16LE(method, 10);
    ch.writeUInt32LE(crc >>> 0, 16);
    ch.writeUInt32LE(csize, 20);
    ch.writeUInt32LE(usize, 24);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE((e.externalAttrs ?? 0) >>> 0, 38);
    ch.writeUInt32LE(offset, 42);
    central.push(ch, name);
    offset += 30 + localName.length + packed.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  const loc = options.zip64Locator ? [Buffer.from([0x50, 0x4b, 0x06, 0x07]), Buffer.alloc(16)] : [];
  // Mit ZIP64-Locator passt «Verzeichnis direkt vor dem Ende» nicht mehr –
  // der Leser muss ZIP64 aber schon vorher erkennen
  return Buffer.concat([...parts, cd, ...(options.gapBeforeEnd ? [options.gapBeforeEnd] : []), ...loc, end]);
}
