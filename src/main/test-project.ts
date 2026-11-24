// Nur für Tests: ein Projekt samt allen Diensten, wie in src/main/index.ts
// verdrahtet, und ein Beispielprojekt mit allem, was ein Lernjournal
// fachlich ausmacht (Journale, Bilder mit Legenden, Kategorien,
// Schlagwörter, Verknüpfung, Link im Text, archiviertes Journal).
// Gemeinsam für die Tests der Projektübergabe (AJ-14) und der Sicherungen (AJ-15).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Sections } from '@shared/journal';
import { journalLinkHref } from '@shared/links';
import { ArchiveService } from './archive/archive-service';
import type { Db } from './db/connection';
import { JournalService } from './journal/journal-service';
import { LinkService } from './links/link-service';
import { MediaService } from './media/media-service';
import { ProjectService, type ServiceDeps } from './project/project-service';
import { SearchIndex } from './search/search-index';
import { TaxonomyService } from './taxonomy/taxonomy-service';

export const PNG = new Uint8Array(readFileSync(path.resolve('e2e/fixtures/screenshot.png')));
export const WEBP = new Uint8Array(readFileSync(path.resolve('e2e/fixtures/bild.webp')));
export const sha = (d: Uint8Array) => createHash('sha256').update(d).digest('hex');
export const lockEnv = { pid: 1, hostname: 'PC', isProcessAlive: () => true, now: () => new Date() };

export function newProjectService(deps: Partial<ServiceDeps> = {}): ProjectService {
  return new ProjectService({ appVersion: '0.1.0', env: {}, lockEnv, ...deps });
}

export function projectServices(projects: ProjectService, now: () => Date = () => new Date()) {
  const db = () => projects.db;
  const search = new SearchIndex(db);
  const media = new MediaService(db, () => projects.dir);
  const links = new LinkService(db);
  const journals = new JournalService(
    db,
    () => projects.dir,
    () => new Date(),
    media,
    links,
    search,
  );
  const taxonomy = new TaxonomyService(db, () => new Date(), search);
  const archive = new ArchiveService({
    getDb: db,
    projectDir: () => projects.dir,
    appVersion: '0.1.0',
    inspectFolder: (d) => projects.inspectFolder(d),
    now,
  });
  return { projects, search, media, links, journals, taxonomy, archive };
}
export type ProjectServices = ReturnType<typeof projectServices>;

export const paragraph = (t: string) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] });
const figure = (mediaId: string, caption: string) => ({
  type: 'figure',
  attrs: { mediaId, caption, alt: '' },
});
export const doc = (...content: unknown[]) => ({ type: 'doc' as const, content });

// Beispielprojekt in `dir` anlegen: drei Journale (eines archiviert), Bilder
// PNG + WebP mit Legenden, Kategorien, Schlagwörter, Verknüpfung, Link im Text
export async function createSampleProject(s: ProjectServices, dir: string) {
  await s.projects.create({
    dir,
    title: 'Lehre 2025–2029',
    profile: {
      displayName: 'Lea Muster',
      company: 'Druckerei AG',
      apprenticeshipStart: '2025-08-01',
      specialization: 'print',
    },
    seedCategories: true,
  });
  const a = s.journals.create({ title: 'Farbmessung am Druckbogen', workDate: '2026-03-14' });
  const b = s.journals.create({ title: 'Papier und Laufrichtung', workDate: '2026-06-20' });
  const c = s.journals.create({ title: 'Alte Übung', workDate: '2025-09-01' });
  const png = s.media.add({ journalId: a.id, data: PNG, originalName: 'Messung.png' });
  const webp = s.media.add({ journalId: a.id, data: WEBP, originalName: 'Bogen.webp' });
  const sectionsA: Sections = {
    auftrag: doc(paragraph('Farbe nach Proof abstimmen')),
    durchfuehrung: doc(
      paragraph('Mit dem Spektralfotometer gemessen, siehe '),
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Laufrichtung',
            marks: [{ type: 'link', attrs: { href: journalLinkHref(b.id) } }],
          },
        ],
      },
      figure(png.id, 'Kontrollstreifen am Bogen'),
      figure(webp.id, 'Druckbogen von oben'),
    ),
    reflexion: doc(paragraph('Nächstes Mal früher messen.')),
  };
  s.journals.updateSections(a.id, sectionsA);
  s.journals.updateSections(b.id, {
    auftrag: doc(paragraph('Papier wählen')),
    durchfuehrung: doc(paragraph('Laufrichtung prüfen')),
    reflexion: doc(paragraph('Gut gelaufen.')),
  });
  s.journals.setStatus(c.id, 'archived');
  const cat = s.taxonomy.list().categories[0]!;
  s.taxonomy.setJournalCategories(a.id, [cat.id]);
  s.taxonomy.setJournalTags(a.id, ['Spektralfotometer', 'Proof']);
  s.taxonomy.setJournalTags(b.id, ['Papier']);
  s.links.add(a.id, c.id);
  return { a: a.id, b: b.id, c: c.id, png: png.id, webp: webp.id };
}

// Alles, was ein Projekt fachlich ausmacht (für den Vergleich vorher/nachher)
export function contentOf(db: Db) {
  const all = (sql: string) => db.prepare(sql).all();
  return {
    project: all('SELECT id, title, created_at FROM project'),
    profile: all('SELECT * FROM profile'),
    journals: all('SELECT * FROM journal ORDER BY id'),
    categories: all('SELECT * FROM category ORDER BY id'),
    journalCategories: all('SELECT * FROM journal_category ORDER BY journal_id, category_id'),
    tags: all('SELECT * FROM tag ORDER BY id'),
    journalTags: all('SELECT * FROM journal_tag ORDER BY journal_id, tag_id'),
    links: all('SELECT * FROM journal_link ORDER BY source_journal_id'),
    media: all('SELECT * FROM media ORDER BY id'),
  };
}

// Zeitlimit für Tests, die viele echte Projekte, Sicherungen oder Übergaben
// auf die Platte schreiben. Begründung: Die Datenbank läuft wie im Programm
// mit synchronous=FULL – jedes COMMIT wartet, bis der Datenträger bestätigt.
// Unter Windows (CI: virtuelle Platte, Virenscanner prüft jede neue Datei)
// ist das 20- bis 30-mal langsamer als unter Linux; Tests, die lokal 0,5 s
// brauchen, liegen dort bei 5–15 s. Nur für solche Tests verwenden, nicht
// als Pauschale (Vitest-Standard bleibt 5 s).
export const HEAVY_TIMEOUT = 60_000;

// Schreibt mit `write(n)` (n = 1, 2, …) immer wieder in die Datenbank,
// solange `task` läuft – nachgestellt wird Speichern während einer Sicherung
// oder Übergabe im Hintergrund. Zwischen zwei Schreibvorgängen gibt die
// Schleife die Ereignisschleife frei (setImmediate), damit `task`
// weiterkommt und Schreibvorgänge mitten in dessen Kopierschritte fallen.
// Endet sicher, sobald `task` fertig ist oder fehlschlägt – auch wenn ein
// Test vorher abbricht, schreibt sie nie in eine bereits geschlossene
// Datenbank (sonst «database is not open» als unbehandelter Fehler).
export async function whileWriting<T>(
  db: Db,
  write: (n: number) => void,
  task: () => Promise<T>,
): Promise<{ result: T; writes: number }> {
  let done = false;
  let writes = 0;
  const writer = (async () => {
    while (!done && db.isOpen) {
      await new Promise((r) => setImmediate(r));
      if (done || !db.isOpen) break;
      writes++;
      write(writes);
    }
  })();
  try {
    const result = await task();
    return { result, writes };
  } finally {
    done = true;
    await writer;
  }
}
