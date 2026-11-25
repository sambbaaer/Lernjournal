// Exportdienst (AJ-12, AJ-13): liest Journale aus der Projektdatenbank, lädt
// ihre Bilder, baut das Word-Dokument (ein Journal oder eine Sammlung) und
// schreibt die Datei sicher.
//
// Kennt kein Electron (testbar mit Vitest). Der Speichern-Dialog und die
// Umwandlung von WebP-Bildern werden von aussen hineingereicht (index.ts).
//
// DOCX ist ein Einweg-Export (SPEC): Die Datei wird geschrieben und danach
// nie wieder gelesen oder mit dem Journal abgeglichen.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { annotatedMediaKey } from '@shared/annotation-key';
import { annotationSvg, parseAnnotations } from '@shared/annotations';
import { journalLinkTargets } from '@shared/links';
import type { Profile } from '@shared/ipc';
import type { ExportFormat } from '@shared/export';
import { computeSchoolYear, localIsoDate } from '@shared/school-year';
import type { Db } from '../db/connection';
import { writeAtomically } from '../fs-atomic';
import { JournalNotFoundError, type JournalService } from '../journal/journal-service';
import { sniffImage } from '../media/image-info';
import { referencedMediaIds, type MediaService } from '../media/media-service';
import type { DocxImage, TiptapNode } from './docx-content';
import { buildCollectionDocument, collectionTitle } from './docx-collection';
import { buildJournalDocument, packDocx, type DocxDesign } from './docx-document';
import { displayTitle, type ExportAuthor, type ExportJournal } from './docx-journal';
import { buildPdfDocument, type PdfDocument } from './pdf-document';

export class ExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExportError'; // Meldung geht unverändert an die Oberfläche (ipc-handler.ts)
  }
}

// Wandelt ein Bild (WebP) in PNG um. In der App: verborgenes, gesichertes
// Chromium-Fenster (image-convert.ts); in Tests: Attrappe.
export type ImageConverter = (data: Uint8Array) => Promise<Uint8Array>;
// Rechnet Foto + Beschriftung (SVG) zu einem Bild zusammen (AJ-32, für Word).
// In der App: verborgenes Fenster (image-convert.ts); in Tests: Attrappe.
export type ImageAnnotator = (image: DocxImage, svg: string) => Promise<Uint8Array>;
export type PdfPrinter = (document: PdfDocument) => Promise<Uint8Array>;

// Vorschlag für den Dateinamen: «2026-03-14 Farbmessung am Druckbogen.docx».
// Datum vorne, damit Exporte im Explorer chronologisch stehen. Zeichen, die
// Windows in Dateinamen verbietet, fallen weg; reservierte Namen (CON, NUL …)
// und Punkte/Leerzeichen am Ende ebenso.
export function suggestFileName(title: string, workDate: string, format: ExportFormat = 'docx'): string {
  return `${workDate} ${safeFileName(displayTitle(title), 'Journal')}.${format}`;
}

// Text als Teil eines Windows-Dateinamens (auch für Ordnernamen, z. B. beim
// Import eines .ajournal, AJ-14): verbotene Zeichen und Steuerzeichen → Leerzeichen,
// höchstens 80 Zeichen, keine Punkte/Leerzeichen am Ende, reservierte Namen mit «_».
export function safeFileName(text: string, fallback: string): string {
  const clean = text
    // eslint-disable-next-line no-control-regex -- Steuerzeichen bewusst entfernen
    .replace(/[\u0000-\u001f<>:"/\\|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
    .replace(/[. ]+$/, '');
  const name = clean || fallback;
  return /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(name) ? `_${name}` : name;
}

export function withExportExtension(file: string, format: ExportFormat = 'docx'): string {
  return file.toLowerCase().endsWith(`.${format}`) ? file : `${file}.${format}`;
}

// Atomar schreiben: erst vollständig in eine Temp-Datei im Zielordner, dann
// umbenennen. So entsteht nie eine halbe Word-Datei, und eine bestehende Datei
// (Überschreiben hat der Dialog bestätigt) bleibt bei einem Fehler unverändert.
export async function writeFileAtomic(file: string, data: Uint8Array): Promise<void> {
  try {
    await writeAtomically(file, (tmp) => writeFile(tmp, data, { flush: true }));
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    // Windows sperrt Dateien, die in Word geöffnet sind
    if (code === 'EBUSY' || code === 'EPERM' || code === 'EACCES') {
      throw new ExportError(
        `«${path.basename(file)}» konnte nicht gespeichert werden. Ist die Datei noch geöffnet? Schliesse sie oder wähle einen anderen Namen.`,
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
    // Uhr für das Exportdatum (Titelseite, Dateiname des Sammel-DOCX); im Test fest
    private readonly now: () => Date = () => new Date(),
    // Beschriftete Bilder für Word zusammenrechnen; ohne: Originalfoto
    private readonly annotate: ImageAnnotator | null = null,
  ) {}

  private get db() {
    return this.getDb();
  }

  author(): ExportAuthor {
    const r = this.db.prepare('SELECT display_name, company FROM profile').get() as
      { display_name: string; company: string | null } | undefined;
    return { displayName: r?.display_name ?? '', company: r?.company ?? null };
  }

  private specialization(): Profile['specialization'] | null {
    const r = this.db.prepare('SELECT specialization FROM profile').get() as
      { specialization: Profile['specialization'] } | undefined;
    return r?.specialization ?? null;
  }

  // Journal so aufbereitet, wie es im Dokument erscheint (Namen statt IDs)
  loadJournal(id: string): ExportJournal {
    let j;
    try {
      j = this.journals.get(id);
    } catch (err) {
      // z. B. in der Zwischenzeit gelöscht: verständliche Meldung statt «Interner Fehler»
      if (err instanceof JournalNotFoundError) {
        throw new ExportError('Ein ausgewähltes Journal gibt es nicht mehr. Bitte die Auswahl prüfen.');
      }
      throw err;
    }
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
      sections: j.sections.map((section) => ({ ...section, doc: section.doc as unknown as TiptapNode })),
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
  async loadImages(journal: ExportJournal, withAnnotated = true): Promise<Map<string, DocxImage>> {
    const out = await this.loadPlainImages(journal);
    // Beschriftete Bilder (AJ-32) für Word: Foto + Formen als ein Bild unter
    // eigenem Schlüssel. Das PDF legt die Formen selbst als SVG darüber.
    if (withAnnotated && this.annotate) {
      for (const fig of annotatedFigures(journal.sections)) {
        const base = out.get(fig.mediaId);
        const key = annotatedMediaKey(fig.mediaId, fig.annotations);
        if (!base || !key || out.has(key)) continue;
        try {
          const data = await this.annotate(
            base,
            annotationSvg(parseAnnotations(fig.annotations), base.widthPx, base.heightPx),
          );
          const info = sniffImage(data);
          if (!info || info.mime === 'image/webp') continue;
          out.set(key, {
            data,
            type: info.mime === 'image/png' ? 'png' : 'jpg',
            widthPx: info.width,
            heightPx: info.height,
          });
        } catch (err) {
          // Dann eben das Originalfoto ohne Beschriftung (Export bricht nicht ab)
          console.error('[export] Bildbeschriftung nicht übernommen:', err);
        }
      }
    }
    return out;
  }

  private async loadPlainImages(journal: ExportJournal): Promise<Map<string, DocxImage>> {
    const out = new Map<string, DocxImage>();
    const ids = referencedMediaIds(journal.sections);
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

  // --- Sammel-DOCX (AJ-13) --------------------------------------------------

  // Vor dem Speichern-Dialog prüfen, ob es alle Journale noch gibt – sonst
  // würde erst nach der Wahl des Speicherorts ein Fehler erscheinen.
  assertJournalsExist(ids: readonly string[]): void {
    const has = this.db.prepare('SELECT 1 FROM journal WHERE id = ?');
    if (ids.some((id) => !has.get(id))) {
      throw new ExportError('Ein ausgewähltes Journal gibt es nicht mehr. Bitte die Auswahl prüfen.');
    }
  }

  // Sammel-DOCX als Bytes + Hinweise. ids = Reihenfolge im Dokument (vom IPC
  // bereits auf Anzahl und Doppelte geprüft).
  async collectionDocx(
    ids: readonly string[],
    title: string,
    design?: DocxDesign,
  ): Promise<{ data: Uint8Array; warnings: string[] }> {
    const { journals, author, images, linkTitles } = await this.loadDocumentData(ids);
    const { doc, warnings } = buildCollectionDocument({
      journals,
      author,
      media: (mediaId) => images.get(mediaId),
      linkTitles,
      info: { title, createdOn: localIsoDate(this.now()), specialization: this.specialization() },
      design,
    });
    return { data: await packDocx(doc), warnings };
  }

  private async loadDocumentData(ids: readonly string[], withAnnotated = true) {
    const journals = ids.map((id) => this.loadJournal(id));
    const author = this.author();
    const images = new Map<string, DocxImage>();
    const linkTitles = new Map<string, string>();
    for (const journal of journals) {
      for (const [id, image] of await this.loadImages(journal, withAnnotated)) images.set(id, image);
      for (const [id, title] of this.linkTitles(journal)) linkTitles.set(id, title);
    }
    return { journals, author, images, linkTitles };
  }

  async exportPdf(ids: readonly string[], title: string | undefined, target: string, print: PdfPrinter) {
    const collection =
      title === undefined
        ? undefined
        : { title, createdOn: localIsoDate(this.now()), specialization: this.specialization() };
    const input = await this.loadDocumentData(ids, false);
    const { document, warnings } = buildPdfDocument({ ...input, collection });
    const data = await print(document);
    await writeFileAtomic(target, data);
    return { bytes: data.byteLength, warnings };
  }

  // Vorschlag «2026-11-24 Lerndokumentation.docx»: Exportdatum + Titel
  suggestedCollectionName(title: string, format?: ExportFormat): string {
    return suggestFileName(collectionTitle(title), localIsoDate(this.now()), format);
  }

  async exportCollectionDocx(
    ids: readonly string[],
    title: string,
    target: string,
  ): Promise<{ bytes: number; warnings: string[] }> {
    const { data, warnings } = await this.collectionDocx(ids, title);
    await writeFileAtomic(target, data);
    return { bytes: data.byteLength, warnings };
  }

  suggestedName(id: string, format?: ExportFormat): string {
    const j = this.journals.get(id);
    return suggestFileName(j.title, j.workDate, format);
  }

  // Exportieren und an den gewählten Ort schreiben
  async exportJournalDocx(id: string, target: string): Promise<{ bytes: number; warnings: string[] }> {
    const { data, warnings } = await this.journalDocx(id);
    await writeFileAtomic(target, data);
    return { bytes: data.byteLength, warnings };
  }
}

// Alle Bilder mit Beschriftung in den Abschnitten eines Journals
export function annotatedFigures(
  sections: readonly { doc: TiptapNode }[],
): { mediaId: string; annotations: unknown }[] {
  const out: { mediaId: string; annotations: unknown }[] = [];
  const walk = (n: TiptapNode) => {
    if (n.type === 'figure' && Array.isArray(n.attrs?.['annotations']) && n.attrs['annotations'].length)
      out.push({ mediaId: String(n.attrs['mediaId'] ?? ''), annotations: n.attrs['annotations'] });
    for (const c of n.content ?? []) walk(c);
  };
  for (const s of sections) walk(s.doc);
  return out;
}
