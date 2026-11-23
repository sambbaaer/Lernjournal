// Öffnet eine Projektdatenbank mit den Einstellungen, die SPEC und ADR 0001
// verlangen. Der einzige Ort, an dem DatabaseSync erzeugt wird.
import { DatabaseSync } from 'node:sqlite';

export type Db = DatabaseSync;

export function openDatabase(file: string, options: { readOnly?: boolean } = {}): Db {
  const db = new DatabaseSync(file, { readOnly: options.readOnly ?? false });
  try {
    // Wartet bis zu 5 s, falls die Datei kurz gesperrt ist (z. B. Virenscanner)
    db.exec('PRAGMA busy_timeout = 5000');
    // Fremdschlüssel sind in SQLite standardmässig AUS – pro Verbindung einschalten
    db.exec('PRAGMA foreign_keys = ON');
    if (!options.readOnly) {
      // WAL: Absturz beim Schreiben beschädigt die Hauptdatei nicht
      db.exec('PRAGMA journal_mode = WAL');
      // FULL: COMMIT kehrt erst zurück, wenn die Daten auf der Platte sind.
      // Nur dann darf die Oberfläche «Gespeichert» anzeigen.
      db.exec('PRAGMA synchronous = FULL');
    }
    return db;
  } catch (err) {
    db.close();
    throw err;
  }
}

// Führt fn in einer Transaktion aus: alles oder nichts.
// Wirft fn einen Fehler, wird alles zurückgerollt und der Fehler weitergegeben.
export function transaction<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE'); // IMMEDIATE: Schreibsperre sofort, keine späten Konflikte
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// Prüft die Datei auf Beschädigung und verletzte Fremdschlüssel.
// Liefert eine Liste von Problemen; leer = in Ordnung.
export function checkIntegrity(db: Db): string[] {
  const problems: string[] = [];
  const rows = db.prepare('PRAGMA integrity_check').all() as { integrity_check: string }[];
  for (const r of rows) if (r.integrity_check !== 'ok') problems.push(r.integrity_check);
  const fk = db.prepare('PRAGMA foreign_key_check').all() as {
    table: string;
    rowid: number;
    parent: string;
  }[];
  for (const r of fk) problems.push(`Fremdschlüssel verletzt: ${r.table} (rowid ${r.rowid}) → ${r.parent}`);
  return problems;
}
