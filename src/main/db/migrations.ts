// Migrationen: bringen jede Projektdatenbank auf den Stand des Programms.
//
// Ablauf beim Öffnen:
//  1. Version der Datei lesen (PRAGMA user_version).
//  2. Neuer als das Programm? → Abbruch mit verständlicher Meldung
//     (nie eine Datei «herunterstufen» und dabei Daten verlieren).
//  3. Älter? → zuerst konsistentes Backup, dann jede fehlende Migration
//     in einer eigenen Transaktion. Schlägt eine fehl, bleibt die Datei
//     auf dem letzten gültigen Stand.
import { backup } from 'node:sqlite';
import { SCHEMA_V1 } from './schema-v1';
import { transaction, type Db } from './connection';

export type Migration = { version: number; name: string; up: (db: Db) => void };

export const MIGRATIONS: readonly Migration[] = [
  { version: 1, name: 'Grundschema P0', up: (db) => db.exec(SCHEMA_V1) },
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

export type MigrationResult = { from: number; to: number; backupFile: string | null };

export async function migrate(
  db: Db,
  options: { backupFile?: (fromVersion: number) => string; migrations?: readonly Migration[] } = {},
): Promise<MigrationResult> {
  const migrations = options.migrations ?? MIGRATIONS;
  const latest = migrations[migrations.length - 1]!.version;
  const from = getSchemaVersion(db);
  if (from > latest) throw new NewerSchemaError(from, latest);
  if (from === latest) return { from, to: from, backupFile: null };

  // Vorhandene Daten vor dem Umbau sichern (neue, leere Datenbanken nicht)
  let backupFile: string | null = null;
  if (from > 0 && options.backupFile) {
    backupFile = options.backupFile(from);
    await backup(db, backupFile);
  }

  for (const m of migrations) {
    if (m.version <= from) continue;
    transaction(db, () => {
      m.up(db);
      // user_version lässt sich nicht parametrisieren; m.version ist eine Zahl aus dem Code
      db.exec(`PRAGMA user_version = ${Math.trunc(m.version)}`);
    });
  }
  return { from, to: getSchemaVersion(db), backupFile };
}
