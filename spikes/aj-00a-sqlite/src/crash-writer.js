// Hilfsprozess für den Absturztest (siehe checkCrashSafety in db-checks.js).
// Schreibt endlos je eine Zeile pro Transaktion und meldet nach jedem
// erfolgreichen COMMIT die laufende Nummer an den Elternprozess.
// Der Elternprozess beendet uns irgendwann hart – genau das simuliert
// einen Absturz oder ein abgewürgtes Programm.
'use strict';

const { openDb } = require('./db-checks');

const file = process.argv[2];
const db = openDb(file);
const insert = db.prepare('INSERT INTO journal (id, title, body) VALUES (?, ?, ?)');

// Zwei Wege, dem Elternprozess zu antworten:
//  - Electron utilityProcess: process.parentPort.postMessage
//  - Node child_process.fork:  process.send
const send = process.parentPort
  ? (msg) => process.parentPort.postMessage(msg)
  : (msg) => process.send(msg);

let i = 0;
function writeOne() {
  db.exec('BEGIN');
  insert.run(`crash-${i}`, `Titel ${i}`, 'Inhalt '.repeat(200));
  db.exec('COMMIT'); // Erst nach diesem Punkt gilt die Zeile als «gespeichert».
  send({ committed: i });
  i++;
  setImmediate(writeOne); // Ereignisschleife frei lassen, damit Nachrichten rausgehen
}
writeOne();
