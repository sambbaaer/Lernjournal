// Datenbank in der Projektübergabe (AJ-14): konsistente Kopie beim Export,
// strenge Prüfung beim Import.
//
// Export – snapshotDatabase():
//   Die laufende Datenbank arbeitet im WAL-Modus; ihre Datei allein zu kopieren
//   könnte bestätigte Änderungen verlieren oder eine halbe Transaktion
//   erwischen. Darum die SQLite-Backup-API (wie vor Migrationen, AJ-04): Sie
//   liefert einen in sich stimmigen Stand, auch während gespeichert wird.
//   Danach wird die Kopie verdichtet (VACUUM: keine freien Seiten mit alten
//   Daten, kleiner) und auf den Journalmodus DELETE gestellt, damit sie ohne
//   -wal/-shm-Dateien vollständig ist. Baustein auch für AJ-15 (Backups).
//
// Import – verifyImportedDatabase():
//   Die Datei kommt von aussen. Bevor das Programm sie wie ein eigenes Projekt
//   behandelt, muss sie genau so aussehen, wie Lernjournal sie selbst anlegt:
//   gleiche Schemaversion wie im Manifest, exakt dasselbe Schema (keine
//   zusätzlichen Tabellen, Trigger oder Views), integrity_check (prüft auch
//   CHECK-, NOT-NULL- und UNIQUE-Regeln), Fremdschlüssel, gültige IDs,
//   Journal-Inhalte nach dem Editor-Schema, Bildverweise nur auf media/.
import { backup } from 'node:sqlite';
import { InvalidContentError, validateSections } from '@shared/editor-schema';
import { JournalId, SectionsSchema } from '@shared/journal';
import { checkIntegrity, openDatabase, type Db } from '../db/connection';
import { getSchemaVersion, LATEST_VERSION, MIGRATIONS } from '../db/migrations';
import { EXT } from '../media/image-info';
import { ArchiveError, DAMAGED, MEDIA_ENTRY } from './archive-format';

export type MediaRow = {
  id: string;
  journalId: string;
  relativePath: string;
  originalName: string;
  mime: string;
  sha256: string;
};

export type SnapshotInfo = {
  schemaVersion: number;
  project: { id: string; title: string };
  journals: number;
  media: MediaRow[];
};

// Konsistente, verdichtete Kopie der geöffneten Datenbank nach `file`
// (Datei darf noch nicht existieren). Prüft die Kopie und liefert, was das
// Manifest braucht.
export async function snapshotDatabase(db: Db, file: string): Promise<SnapshotInfo> {
  await backup(db, file);
  const copy = openDatabase(file, { journalMode: 'delete' });
  try {
    copy.exec('VACUUM');
    const problems = checkIntegrity(copy);
    if (problems.length > 0) {
      console.error('[archiv] Kopie der Datenbank fehlerhaft:', problems.slice(0, 5));
      throw new ArchiveError(
        'database',
        'Die Projektdatenbank ist beschädigt und kann nicht übergeben werden. Stelle eine Sicherung wieder her (Ordner «backups»).',
      );
    }
    const project = copy.prepare('SELECT id, title FROM project').get() as
      { id: string; title: string } | undefined;
    if (!project) throw new ArchiveError('database', 'Die Projektdatei enthält keine Projektangaben.');
    const { n } = copy.prepare('SELECT count(*) AS n FROM journal').get() as { n: number };
    return {
      schemaVersion: getSchemaVersion(copy),
      project: { id: project.id, title: project.title },
      journals: n,
      media: readMedia(copy),
    };
  } finally {
    copy.close();
  }
}

function readMedia(db: Db): MediaRow[] {
  return (
    db
      .prepare(
        'SELECT id, journal_id, relative_path, original_name, mime_type, sha256 FROM media ORDER BY created_at, id',
      )
      .all() as {
      id: string;
      journal_id: string;
      relative_path: string;
      original_name: string;
      mime_type: string;
      sha256: string;
    }[]
  ).map((r) => ({
    id: r.id,
    journalId: r.journal_id,
    relativePath: r.relative_path,
    originalName: r.original_name,
    mime: r.mime_type,
    sha256: r.sha256,
  }));
}

// --- Schema-Vergleich -------------------------------------------------------

// Hilfstabellen, die FTS5 für den Suchindex selbst anlegt. Ihr SQL-Text hängt
// von der SQLite-Version ab (ein Export aus einer anderen Lernjournal-Version
// soll nicht daran scheitern); geprüft wird darum nur, dass es Tabellen sind.
// Der Suchindex wird beim Import ohnehin neu aufgebaut.
const FTS_SHADOW_TABLES = new Set([
  'journal_fts_data',
  'journal_fts_idx',
  'journal_fts_content',
  'journal_fts_docsize',
  'journal_fts_config',
]);

type SchemaMap = Map<string, string>;

function schemaOf(db: Db): SchemaMap {
  const rows = db.prepare('SELECT type, name, tbl_name, sql FROM sqlite_master').all() as {
    type: string;
    name: string;
    tbl_name: string;
    sql: string | null;
  }[];
  const map: SchemaMap = new Map();
  for (const r of rows) {
    map.set(
      `${r.type}:${r.name}`,
      FTS_SHADOW_TABLES.has(r.name) && r.type === 'table' ? 'fts-shadow' : `${r.tbl_name}\n${r.sql ?? ''}`,
    );
  }
  return map;
}

// So sieht eine Datenbank der Version `version` aus, wenn Lernjournal sie
// selbst anlegt: alle Migrationen bis dahin auf eine leere Datenbank im
// Speicher. Ergebnis zwischengespeichert (ändert sich nie während der Laufzeit).
const referenceCache = new Map<number, SchemaMap>();
export function referenceSchema(version: number): SchemaMap {
  let ref = referenceCache.get(version);
  if (!ref) {
    const db = openDatabase(':memory:');
    try {
      for (const m of MIGRATIONS) if (m.version <= version) m.up(db);
      ref = schemaOf(db);
    } finally {
      db.close();
    }
    referenceCache.set(version, ref);
  }
  return ref;
}

const manipulated = (detail: string) => new ArchiveError('database', `${DAMAGED} (Datenbank: ${detail}.)`);

// --- Prüfung beim Import ----------------------------------------------------

export type VerifiedDatabase = {
  schemaVersion: number;
  journals: number;
  media: MediaRow[];
};

// Prüft eine entpackte Datenbank (nur lesend). expectedVersion stammt aus dem
// Manifest. Wirft ArchiveError, wenn etwas nicht stimmt.
export function verifyImportedDatabase(file: string, expectedVersion: number): VerifiedDatabase {
  let db: Db;
  try {
    db = openDatabase(file, { readOnly: true, untrusted: true });
  } catch {
    throw manipulated('keine lesbare SQLite-Datei');
  }
  try {
    let version: number;
    let schema: SchemaMap;
    try {
      version = getSchemaVersion(db);
      schema = schemaOf(db);
    } catch {
      throw manipulated('keine lesbare SQLite-Datei');
    }
    if (version > LATEST_VERSION) {
      throw new ArchiveError(
        'newer-version',
        `Diese Datei wurde mit einer neueren Version von Lernjournal erstellt (Datenformat ${version}, dieses Programm kennt bis ${LATEST_VERSION}). Bitte Lernjournal aktualisieren.`,
      );
    }
    if (version < 1 || version !== expectedVersion) throw manipulated('Version passt nicht zum Manifest');

    // Exakt das Schema dieser Version – nichts mehr, nichts weniger
    const ref = referenceSchema(version);
    const extra = [...schema.keys()].filter((k) => !ref.has(k));
    const missing = [...ref.keys()].filter((k) => !schema.has(k));
    const changed = [...ref.keys()].filter((k) => schema.has(k) && schema.get(k) !== ref.get(k));
    if (extra.length || missing.length || changed.length) {
      console.error('[archiv] Schema weicht ab:', { extra, missing, changed });
      throw manipulated('unerwarteter Aufbau');
    }

    // Erst jetzt, da das Schema bekannt ist, Daten lesen
    const problems = checkIntegrity(db);
    if (problems.length > 0) {
      console.error('[archiv] integrity_check:', problems.slice(0, 5));
      throw manipulated('beschädigt');
    }
    const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
    if (count('SELECT count(*) AS n FROM project') !== 1) throw manipulated('Projektangaben fehlen');

    // IDs: die Oberfläche spricht Journale, Kategorien, Schlagwörter und
    // Bilder über UUIDs an (IPC-Vertrag) – andere IDs wären nicht bedienbar
    for (const table of ['journal', 'category', 'tag', 'media']) {
      const ids = db.prepare(`SELECT id FROM ${table}`).all() as { id: unknown }[];
      if (ids.some((r) => !JournalId.safeParse(r.id).success))
        throw manipulated(`ungültige ID in «${table}»`);
    }

    // Journal-Inhalte nach denselben Regeln wie beim Speichern im Editor
    const journals = db.prepare('SELECT title, sections_json FROM journal').all() as {
      title: string;
      sections_json: string;
    }[];
    for (const j of journals) {
      try {
        const parsed = SectionsSchema.safeParse(JSON.parse(j.sections_json));
        if (!parsed.success) throw new InvalidContentError('Abschnitte fehlen');
        validateSections(parsed.data);
      } catch (err) {
        console.error('[archiv] ungültiger Journal-Inhalt:', (err as Error).message);
        throw new ArchiveError(
          'database',
          `${DAMAGED} (Journal «${j.title.slice(0, 80)}» enthält ungültigen Inhalt.)`,
        );
      }
    }

    // Bilder: nur media/<id>.<Endung passend zum Format> – so legt sie
    // MediaService an (auch beim Duplizieren). Pfade wie «../x» oder
    // «media/../../x» kommen so nie bis zum Dateisystem.
    const media = readMedia(db);
    for (const m of media) {
      const ext = EXT[m.mime as keyof typeof EXT];
      if (!MEDIA_ENTRY.test(m.relativePath) || m.relativePath !== `media/${m.id}.${ext}`)
        throw manipulated('ungültiger Bildverweis');
    }
    return { schemaVersion: version, journals: journals.length, media };
  } finally {
    db.close();
  }
}
