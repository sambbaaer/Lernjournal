// Bilder eines Projekts: speichern, finden, kopieren, aufräumen.
//
// Ablage: <Projekt>/media/<uuid>.<ext>. In der Datenbank (Tabelle media) stehen
// Verweis, Masse, Prüfsumme und Legende. Im Journal-Inhalt steht nur die
// mediaId (Knoten «figure»). So bleibt die Datenbank klein, und Bilder lassen
// sich beim Export/Import per SHA-256 prüfen.
import { createHash, randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Sections } from '@shared/journal';
import { SECTION_KEYS } from '@shared/journal';
import { transaction, type Db } from '../db/connection';
import { EXT, sniffImage } from './image-info';

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // nach Verkleinerung mehr als genug
export const MAX_IMAGE_SIDE = 4000; // Renderer verkleinert auf 2400; Puffer für Hochformat-Screenshots

export class MediaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MediaError';
  }
}

export type AddedMedia = { id: string; width: number; height: number; mime: string };

// Alle mediaIds, auf die ein Journal-Inhalt verweist
export function referencedMediaIds(sections: Sections): Set<string> {
  const ids = new Set<string>();
  const walk = (n: unknown) => {
    if (!n || typeof n !== 'object') return;
    const node = n as { type?: string; attrs?: { mediaId?: unknown }; content?: unknown[] };
    if (node.type === 'figure' && typeof node.attrs?.mediaId === 'string') ids.add(node.attrs.mediaId);
    node.content?.forEach(walk);
  };
  SECTION_KEYS.forEach((k) => walk(sections[k]));
  return ids;
}

export class MediaService {
  constructor(
    private readonly getDb: () => Db,
    private readonly projectDir: () => string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private get db() {
    return this.getDb();
  }
  private mediaDir(): string {
    return path.join(this.projectDir(), 'media');
  }

  add(input: { journalId: string; data: Uint8Array; originalName: string }): AddedMedia {
    if (input.data.byteLength === 0) throw new MediaError('Leere Datei.');
    if (input.data.byteLength > MAX_IMAGE_BYTES) throw new MediaError('Das Bild ist zu gross.');
    const info = sniffImage(input.data);
    if (!info) throw new MediaError('Nur Bilder im Format JPEG, PNG oder WebP sind möglich.');
    if (info.width > MAX_IMAGE_SIDE || info.height > MAX_IMAGE_SIDE)
      throw new MediaError('Das Bild ist zu gross.');
    const exists = this.db.prepare('SELECT 1 FROM journal WHERE id = ?').get(input.journalId);
    if (!exists) throw new MediaError('Journal nicht gefunden.');

    const id = randomUUID();
    const rel = `media/${id}.${EXT[info.mime]}`;
    const file = path.join(this.projectDir(), rel);
    const tmp = `${file}.tmp`;
    // Erst vollständig schreiben, dann umbenennen: nie eine halbe Bilddatei
    writeFileSync(tmp, input.data);
    renameSync(tmp, file);
    try {
      this.db
        .prepare(
          `INSERT INTO media (id, journal_id, relative_path, original_name, mime_type, caption, width, height, sha256, created_at)
           VALUES (?, ?, ?, ?, ?, '', ?, ?, ?, ?)`,
        )
        .run(
          id,
          input.journalId,
          rel,
          safeName(input.originalName),
          info.mime,
          info.width,
          info.height,
          createHash('sha256').update(input.data).digest('hex'),
          this.now().toISOString(),
        );
    } catch (err) {
      rmSync(file, { force: true }); // DB-Eintrag fehlgeschlagen → Datei nicht verwaisen lassen
      throw err;
    }
    return { id, width: info.width, height: info.height, mime: info.mime };
  }

  // Dateipfad zu einer mediaId (für die Anzeige über app://lernjournal/media/<id>).
  // Nur über die Datenbank, nie über Pfade aus der Anfrage.
  resolve(id: string): { file: string; mime: string } | null {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const r = this.db.prepare('SELECT relative_path, mime_type FROM media WHERE id = ?').get(id) as
      { relative_path: string; mime_type: string } | undefined;
    if (!r) return null;
    const file = path.resolve(this.projectDir(), r.relative_path);
    if (!file.startsWith(path.resolve(this.mediaDir()) + path.sep)) return null;
    return { file, mime: r.mime_type };
  }

  // Prüft, dass ein Inhalt nur Bilder dieses Journals verwendet (Integrität),
  // und übernimmt die Legenden in die Tabelle media (für Suche und Export).
  checkAndSyncCaptions(journalId: string, sections: Sections): void {
    const ids = referencedMediaIds(sections);
    if (ids.size === 0) return;
    const owned = new Set(
      (this.db.prepare('SELECT id FROM media WHERE journal_id = ?').all(journalId) as { id: string }[]).map(
        (r) => r.id,
      ),
    );
    for (const id of ids) if (!owned.has(id)) throw new MediaError('Bild gehört nicht zu diesem Journal.');
    const update = this.db.prepare('UPDATE media SET caption = ? WHERE id = ?');
    const walk = (n: unknown) => {
      if (!n || typeof n !== 'object') return;
      const node = n as {
        type?: string;
        attrs?: { mediaId?: string; caption?: unknown };
        content?: unknown[];
      };
      if (node.type === 'figure' && node.attrs?.mediaId)
        update.run(String(node.attrs.caption ?? '').slice(0, 500), node.attrs.mediaId);
      node.content?.forEach(walk);
    };
    SECTION_KEYS.forEach((k) => walk(sections[k]));
  }

  // Beim Duplizieren: Bilder physisch kopieren (neue IDs) und Verweise im Inhalt ersetzen.
  // Muss innerhalb der Transaktion des Duplizierens laufen; liefert neue Dateien zum Aufräumen bei Fehler.
  copyForJournal(
    srcJournalId: string,
    newJournalId: string,
    sectionsJson: string,
  ): { sectionsJson: string; files: string[] } {
    const rows = this.db.prepare('SELECT * FROM media WHERE journal_id = ?').all(srcJournalId) as Record<
      string,
      string | number
    >[];
    let json = sectionsJson;
    const files: string[] = [];
    const insert = this.db.prepare(
      `INSERT INTO media (id, journal_id, relative_path, original_name, mime_type, caption, width, height, sha256, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const r of rows) {
      const src = this.resolve(String(r['id']));
      if (!src || !existsSync(src.file)) continue;
      const newId = randomUUID();
      const rel = `media/${newId}${path.extname(String(r['relative_path']))}`;
      const dest = path.join(this.projectDir(), rel);
      copyFileSync(src.file, dest);
      files.push(dest);
      insert.run(
        newId,
        newJournalId,
        rel,
        r['original_name']!,
        r['mime_type']!,
        r['caption']!,
        r['width']!,
        r['height']!,
        r['sha256']!,
        this.now().toISOString(),
      );
      json = json.split(`"mediaId":"${r['id']}"`).join(`"mediaId":"${newId}"`);
    }
    return { sectionsJson: json, files };
  }

  // Aufräumen (beim Öffnen eines Projekts):
  //  1. Bilder, auf die ihr Journal nicht mehr verweist (z. B. im Editor gelöscht)
  //  2. Dateien in media/, zu denen es keinen Datenbankeintrag gibt
  // Nur Dateien, die älter als minAgeMs sind – so trifft es nie ein Bild, das
  // gerade eingefügt wird.
  collectGarbage(minAgeMs = 60 * 60 * 1000): { rows: number; files: number } {
    const cutoff = this.now().getTime() - minAgeMs;
    let rowsRemoved = 0;
    const journals = this.db.prepare('SELECT DISTINCT journal_id FROM media').all() as {
      journal_id: string;
    }[];
    transaction(this.db, () => {
      for (const { journal_id } of journals) {
        const j = this.db.prepare('SELECT sections_json FROM journal WHERE id = ?').get(journal_id) as
          { sections_json: string } | undefined;
        if (!j) continue;
        const used = referencedMediaIds(JSON.parse(j.sections_json) as Sections);
        const rows = this.db
          .prepare('SELECT id, created_at FROM media WHERE journal_id = ?')
          .all(journal_id) as { id: string; created_at: string }[];
        for (const r of rows) {
          if (!used.has(r.id) && Date.parse(r.created_at) < cutoff) {
            this.db.prepare('DELETE FROM media WHERE id = ?').run(r.id);
            rowsRemoved++;
          }
        }
      }
    });
    const known = new Set(
      (this.db.prepare('SELECT relative_path FROM media').all() as { relative_path: string }[]).map((r) =>
        path.basename(r.relative_path),
      ),
    );
    let filesRemoved = 0;
    const dir = this.mediaDir();
    if (existsSync(dir)) {
      for (const name of readdirSync(dir)) {
        const f = path.join(dir, name);
        if (!known.has(name) && statSync(f).isFile() && statSync(f).mtimeMs < cutoff) {
          rmSync(f, { force: true });
          filesRemoved++;
        }
      }
    }
    return { rows: rowsRemoved, files: filesRemoved };
  }
}

// Ursprünglicher Dateiname nur zur Anzeige; Steuerzeichen und Pfadteile entfernen
export function safeName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const clean = base
    // eslint-disable-next-line no-control-regex -- Steuerzeichen bewusst entfernen
    .replace(/[\u0000-\u001f<>:"|?*]/g, '')
    .trim()
    .slice(0, 200);
  return clean || 'bild';
}
