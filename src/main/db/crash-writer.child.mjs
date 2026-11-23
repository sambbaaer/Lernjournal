// Hilfsprozess für den Absturztest (crash.test.ts): schreibt mit denselben
// Einstellungen wie openDatabase() (WAL, synchronous=FULL) je eine Zeile pro
// Transaktion und meldet nach jedem COMMIT die Nummer. Wird hart beendet.
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(process.argv[2]);
db.exec(
  'PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;',
);
const insert = db.prepare(
  "INSERT INTO journal (id, title, work_date, sections_json, created_at, updated_at) VALUES (?, ?, '2026-03-14', '{}', 'x', 'x')",
);
let i = 0;
function next() {
  db.exec('BEGIN IMMEDIATE');
  insert.run(`j-${i}`, 'Titel '.repeat(50));
  db.exec('COMMIT'); // erst ab hier gilt die Zeile als gespeichert
  process.send({ committed: i++ });
  setImmediate(next);
}
next();
