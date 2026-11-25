// Migrationen: bringen jede Projektdatenbank auf den Stand des Programms.
//
// Ablauf beim Öffnen:
//  1. Version der Datei lesen (PRAGMA user_version).
//  2. Neuer als das Programm? → Abbruch mit verständlicher Meldung
//     (nie eine Datei «herunterstufen» und dabei Daten verlieren).
//  3. Älter? → zuerst konsistente Sicherung (Hook `backup`, im Projekt eine
//     gewöhnliche Sicherung mit Anlass «vor-update», AJ-15), dann jede
//     fehlende Migration in einer eigenen Transaktion. Schlägt eine fehl,
//     bleibt die Datei auf dem letzten gültigen Stand.
import { SCHEMA_V1 } from './schema-v1';
import { SCHEMA_V2 } from './schema-v2';
import { SCHEMA_V3 } from './schema-v3';
import { SCHEMA_V4 } from './schema-v4';
import { migrateJournalSections } from './schema-v5';
import { SCHEMA_V6 } from './schema-v6';
import { transaction, type Db } from './connection';
import { fillSearchIndex } from '../search/search-index';

export type Migration = { version: number; name: string; up: (db: Db) => void };

export const MIGRATIONS: readonly Migration[] = [
  { version: 1, name: 'Grundschema P0', up: (db) => db.exec(SCHEMA_V1) },
  {
    version: 2,
    name: 'Suchindex mit Bildlegenden, Schlagwörtern und Kategorien (AJ-11)',
    // Index ist abgeleitet: neu anlegen und aus den vorhandenen Journalen füllen.
    // fillSearchIndex liest nur Tabellen aus v1 – bleibt also auch später gültig.
    up: (db) => {
      db.exec(SCHEMA_V2);
      fillSearchIndex(db);
    },
  },
  {
    version: 3,
    name: 'Letzte Projektübergabe und Erinnerung (AJ-15)',
    up: (db) => db.exec(SCHEMA_V3),
  },
  { version: 4, name: 'Journalvorlagen', up: (db) => db.exec(SCHEMA_V4) },
  { version: 5, name: 'Frei gestaltbare Journalabschnitte', up: migrateJournalSections },
  { version: 6, name: 'Journale für das QV vormerken', up: (db) => db.exec(SCHEMA_V6) },
  {
    version: 7,
    // Keine Tabellenänderung: Neue Editor-Bausteine (Hinweisbox, Checkliste,
    // Rechenblock, Merkstelle, Bildbeschriftung, Schlagwort-Querverweis) stehen
    // im Journal-JSON. Die höhere Version schützt Projekte davor, mit einer
    // älteren App (z. B. portable EXE ohne Update) geöffnet zu werden, die
    // diese Inhalte nicht kennt und beim Speichern verwerfen würde.
    name: 'Neue Editor-Bausteine (AJ-27 bis AJ-33)',
    up: () => {},
  },
];

export const LATEST_VERSION = MIGRATIONS[MIGRATIONS.length - 1]!.version;

export class NewerSchemaError extends Error {
  constructor(
    readonly fileVersion: number,
    readonly appVersion: number,
  ) {
    super(
      `Dieses Projekt wurde mit einer neueren Version von Lernjournal gespeichert (Datenformat ${fileVersion}, ` +
        `dieses Programm kennt bis ${appVersion}). Bitte Lernjournal aktualisieren.`,
    );
    this.name = 'NewerSchemaError';
  }
}

export function getSchemaVersion(db: Db): number {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number };
  return row.user_version;
}

// backup: Kennung der Sicherung vor dem Umbau (z. B. ID im Ordner «backups»)
export type MigrationResult = { from: number; to: number; backup: string | null };

export type MigrateOptions = {
  // Sichert die Datenbank im alten Stand, bevor umgebaut wird, und liefert
  // eine Kennung der Sicherung. Wirft er, wird NICHT migriert.
  backup?: (db: Db, fromVersion: number) => Promise<string>;
  migrations?: readonly Migration[];
};

export async function migrate(db: Db, options: MigrateOptions = {}): Promise<MigrationResult> {
  const migrations = options.migrations ?? MIGRATIONS;
  const latest = migrations[migrations.length - 1]!.version;
  const from = getSchemaVersion(db);
  if (from > latest) throw new NewerSchemaError(from, latest);
  if (from === latest) return { from, to: from, backup: null };

  // Vorhandene Daten vor dem Umbau sichern (neue, leere Datenbanken nicht)
  let backup: string | null = null;
  if (from > 0 && options.backup) backup = await options.backup(db, from);

  for (const m of migrations) {
    if (m.version <= from) continue;
    transaction(db, () => {
      m.up(db);
      // user_version lässt sich nicht parametrisieren; m.version ist eine Zahl aus dem Code
      db.exec(`PRAGMA user_version = ${Math.trunc(m.version)}`);
    });
  }
  return { from, to: getSchemaVersion(db), backup };
}
