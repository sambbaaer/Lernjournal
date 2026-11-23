// Tests: Bildformat-Erkennung und Mediendienst (speichern, auflösen, Integrität, Duplikat, Aufräumen).
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InvalidContentError } from '@shared/editor-schema';
import type { Sections } from '@shared/journal';
import { JournalService } from '../journal/journal-service';
import { ProjectService } from '../project/project-service';
import { sniffImage } from './image-info';
import { MediaError, MediaService, referencedMediaIds, safeName } from './media-service';

const fixture = (n: string) => new Uint8Array(readFileSync(path.resolve('e2e/fixtures', n)));

describe('Bildformat aus den Bytes erkennen', () => {
  it('erkennt PNG, JPEG und WebP mit Massen', () => {
    expect(sniffImage(fixture('screenshot.png'))).toEqual({ mime: 'image/png', width: 800, height: 500 });
    expect(sniffImage(fixture('foto-mit-gps.jpg'))).toEqual({
      mime: 'image/jpeg',
      width: 3000,
      height: 2000,
    });
    expect(sniffImage(fixture('bild.webp'))).toEqual({ mime: 'image/webp', width: 320, height: 200 });
  });
  it('lehnt Text, abgeschnittene und getarnte Dateien ab', () => {
    expect(sniffImage(fixture('kein-bild.png'))).toBeNull();
    expect(sniffImage(fixture('screenshot.png').subarray(0, 10))).toBeNull();
    expect(sniffImage(new TextEncoder().encode('GIF89a......'))).toBeNull();
    expect(sniffImage(new Uint8Array(0))).toBeNull();
  });
});

describe('Mediendienst', () => {
  let root: string;
  let projects: ProjectService;
  let media: MediaService;
  let journals: JournalService;
  let clock: Date;

  beforeEach(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'lj-m-'));
    clock = new Date('2026-03-14T09:00:00Z');
    projects = new ProjectService({
      appVersion: '0.1.0',
      env: {},
      lockEnv: { pid: 1, hostname: 'PC', isProcessAlive: () => true, now: () => new Date() },
    });
    await projects.create({
      dir: path.join(root, 'p'),
      title: 'P',
      profile: { displayName: '', company: null, apprenticeshipStart: null, specialization: 'print' },
      seedCategories: false,
    });
    media = new MediaService(
      () => projects.db,
      () => projects.dir,
      () => clock,
    );
    journals = new JournalService(
      () => projects.db,
      () => projects.dir,
      () => clock,
      media,
    );
  });
  afterEach(() => {
    projects.close();
    rmSync(root, { recursive: true, force: true });
  });

  const withFigure = (s: Sections, mediaId: string, caption = ''): Sections => ({
    ...s,
    durchfuehrung: { type: 'doc', content: [{ type: 'figure', attrs: { mediaId, caption, alt: '' } }] },
  });

  it('speichert ein Bild unter media/<uuid>.<ext> mit Prüfsumme', () => {
    const j = journals.create();
    const m = media.add({
      journalId: j.id,
      data: fixture('screenshot.png'),
      originalName: 'C:\\Users\\lea\\Bildschirm.png',
    });
    expect(m).toMatchObject({ width: 800, height: 500, mime: 'image/png' });
    const r = media.resolve(m.id)!;
    expect(path.basename(r.file)).toBe(`${m.id}.png`);
    expect(readFileSync(r.file)).toEqual(Buffer.from(fixture('screenshot.png')));
    const row = projects.db.prepare('SELECT original_name, sha256 FROM media WHERE id = ?').get(m.id) as {
      original_name: string;
      sha256: string;
    };
    expect(row.original_name).toBe('Bildschirm.png');
    expect(row.sha256).toHaveLength(64);
    // Keine Hilfsdatei übrig
    expect(readdirSync(path.join(projects.dir, 'media')).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('lehnt Nicht-Bilder, zu grosse Dateien und unbekannte Journale ab', () => {
    const j = journals.create();
    expect(() =>
      media.add({ journalId: j.id, data: fixture('kein-bild.png'), originalName: 'x.png' }),
    ).toThrow(MediaError);
    expect(() =>
      media.add({ journalId: j.id, data: new Uint8Array(16 * 1024 * 1024), originalName: 'x' }),
    ).toThrow(/zu gross/);
    expect(() =>
      media.add({
        journalId: '00000000-0000-4000-8000-000000000000',
        data: fixture('bild.webp'),
        originalName: 'x',
      }),
    ).toThrow(MediaError);
    expect(readdirSync(path.join(projects.dir, 'media'))).toEqual([]);
  });

  it('löst nur gültige IDs aus der Datenbank auf (keine Pfade)', () => {
    expect(media.resolve('../../journal.sqlite')).toBeNull();
    expect(media.resolve('00000000-0000-4000-8000-000000000000')).toBeNull();
  });

  it('Inhalt darf nur Bilder des eigenen Journals verwenden; Legende wird übernommen', () => {
    const a = journals.create();
    const b = journals.create();
    const m = media.add({ journalId: a.id, data: fixture('screenshot.png'), originalName: 'a.png' });
    journals.updateSections(a.id, withFigure(a.sections, m.id, 'Kontrollstreifen'));
    expect(projects.db.prepare('SELECT caption FROM media WHERE id = ?').get(m.id)).toEqual({
      caption: 'Kontrollstreifen',
    });
    expect(() => journals.updateSections(b.id, withFigure(b.sections, m.id))).toThrow(MediaError);
    // Legende ist durchsuchbar
    expect(
      projects.db
        .prepare("SELECT count(*) n FROM journal_fts WHERE journal_fts MATCH 'kontrollstreifen'")
        .get(),
    ).toEqual({ n: 1 });
    expect(InvalidContentError).toBeDefined();
  });

  it('Duplizieren kopiert Bilddateien mit neuen IDs und passt den Inhalt an', () => {
    const a = journals.create({ title: 'Mit Bild' });
    const m = media.add({ journalId: a.id, data: fixture('screenshot.png'), originalName: 'a.png' });
    journals.updateSections(a.id, withFigure(a.sections, m.id, 'Legende'));
    const c = journals.duplicate(a.id);
    const ids = [...referencedMediaIds(c.sections)];
    expect(ids).toHaveLength(1);
    expect(ids[0]).not.toBe(m.id);
    expect(existsSync(media.resolve(ids[0]!)!.file)).toBe(true);
    // Original löschen → Kopie behält ihr Bild
    journals.delete(a.id);
    expect(existsSync(media.resolve(ids[0]!)!.file)).toBe(true);
    expect(existsSync(path.join(projects.dir, 'media', `${m.id}.png`))).toBe(false);
  });

  it('Aufräumen: entfernt nicht mehr verwendete Bilder und fremde Dateien, aber nur ältere', () => {
    const j = journals.create();
    const used = media.add({ journalId: j.id, data: fixture('screenshot.png'), originalName: 'a.png' });
    const unused = media.add({ journalId: j.id, data: fixture('bild.webp'), originalName: 'b.webp' });
    journals.updateSections(j.id, withFigure(j.sections, used.id));
    const stray = path.join(projects.dir, 'media', 'fremd.png');
    writeFileSync(stray, 'x');
    // Sofort: nichts entfernen (Bild könnte gerade eingefügt werden)
    expect(media.collectGarbage()).toEqual({ rows: 0, files: 0 });
    // Zwei Stunden später
    clock = new Date(clock.getTime() + 2 * 3600_000);
    const old = (clock.getTime() - 3 * 3600_000) / 1000;
    for (const f of readdirSync(path.join(projects.dir, 'media')))
      utimesSync(path.join(projects.dir, 'media', f), old, old);
    expect(media.collectGarbage()).toEqual({ rows: 1, files: 2 });
    expect(media.resolve(used.id)).not.toBeNull();
    expect(media.resolve(unused.id)).toBeNull();
    expect(existsSync(stray)).toBe(false);
  });

  it('sichere Anzeigenamen', () => {
    expect(safeName('../../etc/passwd')).toBe('passwd');
    expect(safeName('a\u0000b<c>.png')).toBe('abc.png');
    expect(safeName('')).toBe('bild');
  });
});
