// Exportdienst (AJ-12): liest ein Journal aus der Projektdatenbank, lädt seine
// Bilder, baut das Word-Dokument und schreibt die Datei sicher.
//
// Kennt kein Electron (testbar mit Vitest). Der Speichern-Dialog und die
// Umwandlung von WebP-Bildern werden von aussen hineingereicht (index.ts).
//
// DOCX ist ein Einweg-Export (SPEC): Die Datei wird geschrieben und danach
// nie wieder gelesen oder mit dem Journal abgeglichen.
import { randomUUID } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { SECTION_KEYS, type Sections } from '@shared/journal';
import { journalLinkTargets } from '@shared/links';
import { computeSchoolYear } from '@shared/school-year';
import type { Db } from '../db/connection';
import type { JournalService } from '../journal/journal-service';
import { sniffImage } from '../media/image-info';
import { referencedMediaIds, type MediaService } from '../media/media-service';
import type { DocxImage, TiptapNode } from './docx-content';
import { buildJournalDocument, packDocx, type DocxDesign } from './docx-document';
import { displayTitle, type ExportAuthor, type ExportJournal } from './docx-journal';

export class ExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExportError'; // Meldung geht unverändert an die Oberfläche (ipc-handler.ts)
  }
}

// Wandelt ein Bild (WebP) in PNG um. In der App: verborgenes, gesichertes
// Chromium-Fenster (image-convert.ts); in Tests: Attrappe.
export type ImageConverter = (data: Uint8Array) => Promise<Uint8Array>;

// Vorschlag für den Dateinamen: «2026-03-14 Farbmessung am Druckbogen.docx».
// Datum vorne, damit Exporte im Explorer chronologisch stehen. Zeichen, die
// Windows in Dateinamen verbietet, fallen weg; reservierte Namen (CON, NUL …)
// und Punkte/Leerzeichen am Ende ebenso.
export function suggestFileName(title: string, workDate: string): string {
  const clean = displayTitle(title)
    // eslint-disable-next-line no-control-regex -- Steuerzeichen bewusst entfernen
    .replace(/[\u0000-\u001f<>:"/\\|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
    .replace(/[. ]+$/, '');
  const name = `${workDate} ${clean || 'Journal'}`.trim();
  return `${/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(name) ? `_${name}` : name}.docx`;
}

// Endung «.docx» ergänzen, falls im Dialog weggelassen
export function withDocxExtension(file: string): string {
  return /\.docx$/i.test(file) ? file : `${file}.docx`;
}

// Atomar schreiben: erst vollständig in eine Temp-Datei im Zielordner, dann
// umbenennen. So entsteht nie eine halbe Word-Datei, und eine bestehende Datei
// (Überschreiben hat der Dialog bestätigt) bleibt bei einem Fehler unverändert.
export async function writeFileAtomic(file: string, data: Uint8Array): Promise<void> {
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID().slice(0, 8)}.tmp`);
  try {
    await writeFile(tmp, data, { flush: true });
    await rename(tmp, file);
  } catch (err) {
    await rm(tmp, { force: true }).catch(() => {});
    const code = (err as NodeJS.ErrnoException).code;
    // Windows sperrt Dateien, die in Word geöffnet sind
    if (code === 'EBUSY' || code === 'EPERM' || code === 'EACCES') {
      throw new ExportError(
        `«${path.basename(file)}» konnte nicht gespeichert werden. Ist die Datei noch in Word geöffnet? Schliesse sie oder wähle einen anderen Namen.`,
      );
    }
    if (code === 'ENOENT' || code === 'ENOSPC' || code === 'EROFS') {
      throw new ExportError(
        'Die Datei konnte nicht gespeichert werden. Ist der Ordner (z. B. USB-Stick) noch erreichbar und genug Platz frei?',
      );
    }
    throw err;
  }
}

export class ExportService {
  constructor(
    private readonly getDb: () => Db,
    private readonly journals: JournalService,
    private readonly media: MediaService,
    private readonly convertToPng: ImageConverter,
  ) {}

  private get db() {
    return this.getDb();
  }

  author(): ExportAuthor {
    const r = this.db.prepare('SELECT display_name, company FROM profile').get() as
      { display_name: string; company: string | null } | undefined;
    return { displayName: r?.display_name ?? '', company: r?.company ?? null };
  }

  // Journal so aufbereitet, wie es im Dokument erscheint (Namen statt IDs)
  loadJournal(id: string): ExportJournal {
    const j = this.journals.get(id); // wirft, wenn es das Journal nicht gibt
    const names = (sql: string) => (this.db.prepare(sql).all(id) as { name: string }[]).map((r) => r.name);
    const start = this.db.prepare('SELECT apprenticeship_start AS s FROM profile').get() as
      { s: string | null } | undefined;
    // Semester nur, wenn das Lehrjahr berechnet ist (bei manueller Angabe unbekannt)
    const computed = j.schoolYearOverride === null ? computeSchoolYear(start?.s ?? null, j.workDate) : null;
    return {
      id: j.id,
      title: j.title,
      workDate: j.workDate,
      schoolYear: j.schoolYear,
      semester: computed?.semester ?? null,
      learningPlace: j.learningPlace,
      categories: names(
        `SELECT c.name FROM journal_category x JOIN category c ON c.id = x.category_id
         WHERE x.journal_id = ? ORDER BY c.sort_order, c.name COLLATE NOCASE`,
      ),
      tags: names(
        `SELECT t.name FROM journal_tag x JOIN tag t ON t.id = x.tag_id
         WHERE x.journal_id = ? ORDER BY t.name COLLATE NOCASE`,
      ),
      sections: Object.fromEntries(
        SECTION_KEYS.map((k) => [k, j.sections[k] as unknown as TiptapNode]),
      ) as ExportJournal['sections'],
    };
  }

  // Titel aller Journale, auf die im Text verlinkt wird
  linkTitles(journal: ExportJournal): Map<string, string> {
    const titles = new Map<string, string>();
    const get = this.db.prepare('SELECT title FROM journal WHERE id = ?');
    for (const target of journalLinkTargets(journal.sections)) {
      const r = get.get(target) as { title: string } | undefined;
      if (r) titles.set(target, displayTitle(r.title));
    }
    return titles;
  }

  // Bilder laden: nur über die Datenbank aufgelöste Dateien in media/, Format
  // aus den Bytes geprüft. WebP (kann Word nicht sicher anzeigen) → PNG.
  // Fehlt eine Datei oder schlägt die Umwandlung fehl, fehlt nur dieses Bild
  // (Platzhalter + Hinweis im Dokument) – der Export bricht nicht ab.
  async loadImages(journal: ExportJournal): Promise<Map<string, DocxImage>> {
    const out = new Map<string, DocxImage>();
    const ids = referencedMediaIds(journal.sections as unknown as Sections);
    for (const id of ids) {
      const found = this.media.resolve(id);
      if (!found) continue;
      let data: Uint8Array;
      try {
        data = new Uint8Array(await readFile(found.file));
      } catch {
        continue;
      }
      let info = sniffImage(data);
      if (info?.mime === 'image/webp') {
        try {
          data = await this.convertToPng(data);
          info = sniffImage(data);
        } catch (err) {
          console.error('[export] WebP-Umwandlung fehlgeschlagen:', err);
          continue;
        }
      }
      if (!info || info.mime === 'image/webp') continue;
      out.set(id, {
        data,
        type: info.mime === 'image/png' ? 'png' : 'jpg',
        widthPx: info.width,
        heightPx: info.height,
      });
    }
    return out;
  }

  // Einzel-DOCX als Bytes + Hinweise
  async journalDocx(id: string, design?: DocxDesign): Promise<{ data: Uint8Array; warnings: string[] }> {
    const journal = this.loadJournal(id);
    const images = await this.loadImages(journal);
    const { doc, warnings } = buildJournalDocument({
      journal,
      author: this.author(),
      media: (mediaId) => images.get(mediaId),
      linkTitles: this.linkTitles(journal),
      design,
    });
    return { data: await packDocx(doc), warnings };
  }

  suggestedName(id: string): string {
    const j = this.journals.get(id);
    return suggestFileName(j.title, j.workDate);
  }

  // Exportieren und an den gewählten Ort schreiben
  async exportJournalDocx(id: string, target: string): Promise<{ bytes: number; warnings: string[] }> {
    const { data, warnings } = await this.journalDocx(id);
    await writeFileAtomic(target, data);
    return { bytes: data.byteLength, warnings };
  }
}
