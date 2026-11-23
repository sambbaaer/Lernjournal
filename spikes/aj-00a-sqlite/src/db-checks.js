// AJ-00a – Spike: Funktioniert SQLite so, wie die SPEC es verlangt?
//
// Dieses Modul enthält alle Prüfungen als einzelne Funktionen. Es wird von
// zwei Stellen aus aufgerufen:
//   1. run-node.js   – mit normalem Node.js (schneller Entwickler-Test)
//   2. main.js       – im Electron-Hauptprozess, auch im GEPACKTEN Build.
// Punkt 2 ist der eigentliche Zweck des Spikes: Native Module scheitern oft
// erst im gepackten Programm (falsche ABI, fehlende .node-Datei in der ASAR).
//
// Getestet wird der in Node/Electron eingebaute Adapter `node:sqlite`.
// Vorteil: kein natives Zusatzmodul → kein Neukompilieren für Electron,
// keine Visual-Studio-Build-Tools auf Windows nötig.

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync, backup } = require('node:sqlite');

// Kleine Hilfsfunktion: wirft einen Fehler mit verständlicher Meldung,
// wenn eine Bedingung nicht erfüllt ist. So bleibt jeder Check kurz.
function expect(condition, message) {
  if (!condition) throw new Error(message);
}

// Öffnet eine Datenbank mit den Einstellungen, die die SPEC fordert.
function openDb(file) {
  const db = new DatabaseSync(file);
  // WAL (Write-Ahead-Log): Schreiben blockiert Lesen nicht, und ein Absturz
  // mitten im Schreiben beschädigt die Hauptdatei nicht.
  db.exec('PRAGMA journal_mode = WAL');
  // synchronous=FULL: Ein COMMIT kehrt erst zurück, wenn die Daten wirklich
  // auf der Platte sind. Nur dann dürfen wir «Gespeichert» anzeigen.
  db.exec('PRAGMA synchronous = FULL');
  // Fremdschlüssel sind in SQLite standardmässig AUS – pro Verbindung einschalten.
  db.exec('PRAGMA foreign_keys = ON');
  return db;
}

// Minimales Schema, angelehnt an SPEC (nur was für die Checks nötig ist).
function createSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS journal (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS tag (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE
    );
    -- Zuordnungstabelle: PRIMARY KEY verhindert doppelte Beziehungen,
    -- ON DELETE CASCADE räumt Zuordnungen beim Löschen eines Journals auf.
    CREATE TABLE IF NOT EXISTS journal_tag (
      journal_id TEXT NOT NULL REFERENCES journal(id) ON DELETE CASCADE,
      tag_id TEXT NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
      PRIMARY KEY (journal_id, tag_id)
    );
    -- Suchindex: FTS5 mit Tokenizer, der Gross-/Kleinschreibung und
    -- Akzente ignoriert («Möglichkeit» findet auch «moglichkeit»).
    CREATE VIRTUAL TABLE IF NOT EXISTS journal_fts USING fts5(
      journal_id UNINDEXED, title, body,
      tokenize = 'unicode61 remove_diacritics 2'
    );
  `);
}

// ---------------------------------------------------------------------------
// Die einzelnen Checks. Jeder bekommt ein leeres Arbeitsverzeichnis.
// ---------------------------------------------------------------------------

function checkVersions() {
  const db = new DatabaseSync(':memory:');
  const { v } = db.prepare('SELECT sqlite_version() AS v').get();
  db.close();
  return `SQLite ${v}, Node ${process.versions.node}` +
    (process.versions.electron ? `, Electron ${process.versions.electron}` : '');
}

function checkWalAndForeignKeys(dir) {
  const db = openDb(path.join(dir, 'wal.sqlite'));
  const { journal_mode } = db.prepare('PRAGMA journal_mode').get();
  expect(journal_mode === 'wal', `journal_mode ist ${journal_mode}, erwartet wal`);
  createSchema(db);

  // Zuordnung zu einem nicht existierenden Journal muss scheitern.
  let failed = false;
  try {
    db.prepare("INSERT INTO journal_tag VALUES ('gibt-es-nicht', 'auch-nicht')").run();
  } catch {
    failed = true;
  }
  expect(failed, 'Fremdschlüssel wurden nicht durchgesetzt');

  // Doppelte Beziehung muss scheitern.
  db.exec("INSERT INTO journal VALUES ('j1', 'Titel', '')");
  db.exec("INSERT INTO tag VALUES ('t1', 'Offset')");
  db.exec("INSERT INTO journal_tag VALUES ('j1', 't1')");
  failed = false;
  try {
    db.exec("INSERT INTO journal_tag VALUES ('j1', 't1')");
  } catch {
    failed = true;
  }
  expect(failed, 'Doppelte Beziehung wurde akzeptiert');

  // Löschen kaskadiert auf die Zuordnung.
  db.exec("DELETE FROM journal WHERE id = 'j1'");
  const { n } = db.prepare('SELECT count(*) AS n FROM journal_tag').get();
  expect(n === 0, 'ON DELETE CASCADE hat nicht gegriffen');
  db.close();
  return 'WAL aktiv, Fremdschlüssel, Unique-Beziehung und Cascade ok';
}

function checkTransactionRollback(dir) {
  const db = openDb(path.join(dir, 'tx.sqlite'));
  createSchema(db);
  // Simulierter Fehler mitten in einer Transaktion: nichts darf übrig bleiben.
  try {
    db.exec('BEGIN');
    db.exec("INSERT INTO journal VALUES ('a', 'A', '')");
    db.exec("INSERT INTO journal VALUES ('a', 'Doppelt', '')"); // Primärschlüssel-Fehler
    db.exec('COMMIT');
  } catch {
    db.exec('ROLLBACK');
  }
  const { n } = db.prepare('SELECT count(*) AS n FROM journal').get();
  expect(n === 0, `Nach ROLLBACK ${n} statt 0 Zeilen`);
  db.close();
  return 'ROLLBACK verwirft Teiländerungen vollständig';
}

function checkFts5(dir) {
  const db = openDb(path.join(dir, 'fts.sqlite'));
  createSchema(db);
  const insert = db.prepare('INSERT INTO journal_fts (journal_id, title, body) VALUES (?, ?, ?)');
  insert.run('j1', 'Farbmessung am Druckbogen', 'Mit dem Spektralfotometer die Volltondichte gemessen.');
  insert.run('j2', 'Möglichkeiten der Weiterverarbeitung', 'Falzen, Rillen, Stanzen.');
  insert.run('j3', 'Plattenwechsel', 'Feuchtwerk gereinigt, Gummituch gewaschen.');

  // Hilfsfunktion: welche Journale findet ein Suchbegriff?
  const search = (q) =>
    db.prepare('SELECT journal_id FROM journal_fts WHERE journal_fts MATCH ? ORDER BY rank')
      .all(q).map((r) => r.journal_id);

  // Gross-/Kleinschreibung egal
  expect(search('farbmessung').join() === 'j1', 'Kleinschreibung findet Titel nicht');
  // Akzente egal: «moglichkeiten» ohne Umlaut findet «Möglichkeiten»
  expect(search('moglichkeiten').join() === 'j2', 'Umlaut-unabhängige Suche fehlgeschlagen');
  // Präfixsuche (für Suche während der Eingabe)
  expect(search('gummi*').join() === 'j3', 'Präfixsuche fehlgeschlagen');
  // Snippet mit Hervorhebung für die Trefferliste
  const { s } = db.prepare(
    "SELECT snippet(journal_fts, 2, '[', ']', '…', 6) AS s FROM journal_fts WHERE journal_fts MATCH 'stanzen'"
  ).get();
  expect(s.includes('[Stanzen]'), `Snippet unerwartet: ${s}`);
  db.close();
  return 'FTS5: case-/diakritikunabhängig, Präfix, Snippet ok';
}

// Backup mit der SQLite-Backup-API, WÄHREND weiterhin geschrieben wird.
// Die Kopie muss in sich konsistent sein (integrity_check = ok).
async function checkOnlineBackup(dir) {
  const file = path.join(dir, 'live.sqlite');
  const db = openDb(file);
  createSchema(db);
  const insert = db.prepare('INSERT INTO journal (id, title, body) VALUES (?, ?, ?)');
  const bigText = 'Lorem ipsum '.repeat(500); // ca. 6 KB pro Zeile → Backup dauert mehrere Schritte
  db.exec('BEGIN');
  for (let i = 0; i < 2000; i++) insert.run(`vorher-${i}`, `Titel ${i}`, bigText);
  db.exec('COMMIT');

  // Während das Backup in kleinen Portionen (rate = Seiten pro Schritt) läuft,
  // schreiben wir per Timer weiter. So sehen wir, ob die Kopie trotzdem stimmt.
  let extra = 0;
  const timer = setInterval(() => {
    insert.run(`waehrend-${extra++}`, 'Neu', 'x');
  }, 1);

  const target = path.join(dir, 'backup.sqlite');
  const pages = await backup(db, target, { rate: 50 });
  clearInterval(timer);
  db.close();

  const copy = new DatabaseSync(target, { readOnly: true });
  const { integrity_check } = copy.prepare('PRAGMA integrity_check').get();
  const { n } = copy.prepare('SELECT count(*) AS n FROM journal').get();
  copy.close();
  expect(integrity_check === 'ok', `Backup beschädigt: ${integrity_check}`);
  expect(n >= 2000, `Backup enthält nur ${n} Zeilen`);
  return `Online-Backup konsistent (${pages} Seiten, ${n} Zeilen, ${extra} Schreibvorgänge parallel)`;
}

// Absturztest: Ein separater Prozess schreibt in Transaktionen und meldet
// nach jedem COMMIT die Nummer zurück. Wir töten ihn hart (SIGKILL bzw.
// TerminateProcess auf Windows) und prüfen danach:
//   - Datei nicht beschädigt
//   - jede als bestätigt gemeldete Transaktion ist vorhanden
// `spawnWriter(file)` wird vom Aufrufer geliefert (Node: child_process.fork,
// Electron: utilityProcess.fork), damit der Test in beiden Umgebungen läuft.
async function checkCrashSafety(dir, spawnWriter) {
  const file = path.join(dir, 'crash.sqlite');
  {
    const db = openDb(file);
    createSchema(db);
    db.close();
  }
  const { lastConfirmed } = await new Promise((resolve, reject) => {
    let lastConfirmed = -1;
    const child = spawnWriter(file);
    child.onMessage((msg) => {
      lastConfirmed = msg.committed;
      // Nach 300 bestätigten Transaktionen ohne Vorwarnung beenden.
      if (lastConfirmed >= 300) child.kill();
    });
    child.onExit(() => resolve({ lastConfirmed }));
    setTimeout(() => reject(new Error('Schreibprozess hat nicht geantwortet')), 30000);
  });

  const db = openDb(file);
  const { integrity_check } = db.prepare('PRAGMA integrity_check').get();
  const { n } = db.prepare('SELECT count(*) AS n FROM journal').get();
  db.close();
  expect(integrity_check === 'ok', `Nach Absturz beschädigt: ${integrity_check}`);
  // Jede bestätigte Transaktion (0..lastConfirmed) muss da sein.
  // Eine weitere, noch nicht gemeldete darf zusätzlich vorhanden sein.
  expect(n >= lastConfirmed + 1, `Datenverlust: ${n} Zeilen, bestätigt waren ${lastConfirmed + 1}`);
  return `Nach hartem Abbruch: integrity ok, ${n} Zeilen ≥ ${lastConfirmed + 1} bestätigte`;
}

// Führt alle Checks aus und liefert ein Ergebnisobjekt (für JSON-Bericht).
async function runAll({ workDir, spawnWriter }) {
  fs.rmSync(workDir, { recursive: true, force: true });
  fs.mkdirSync(workDir, { recursive: true });
  const checks = [
    ['Versionen', () => checkVersions()],
    ['WAL + Integrität', () => checkWalAndForeignKeys(workDir)],
    ['Transaktion/Rollback', () => checkTransactionRollback(workDir)],
    ['FTS5-Suche', () => checkFts5(workDir)],
    ['Online-Backup', () => checkOnlineBackup(workDir)],
    ['Absturzsicherheit', () => checkCrashSafety(workDir, spawnWriter)],
  ];
  const results = [];
  for (const [name, fn] of checks) {
    try {
      results.push({ name, ok: true, detail: await fn() });
    } catch (err) {
      results.push({ name, ok: false, detail: String(err && err.message ? err.message : err) });
    }
  }
  return {
    platform: `${process.platform}-${process.arch}`,
    packaged: Boolean(process.resourcesPath && !process.defaultApp && process.versions.electron),
    allOk: results.every((r) => r.ok),
    results,
  };
}

module.exports = { runAll, openDb, createSchema };
