// Absturztest (SPEC P0-Abnahme 9): «Bestätigte Speicherung übersteht erzwungenen Abbruch».
import { fork } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkIntegrity, openDatabase } from './connection';
import { migrate } from './migrations';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'lj-crash-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('Absturzsicherheit', () => {
  it('nach hartem Abbruch: Datei intakt, keine bestätigte Transaktion verloren', async () => {
    const file = path.join(dir, 'journal.sqlite');
    const db = openDatabase(file);
    await migrate(db);
    db.close();

    const lastConfirmed = await new Promise<number>((resolve, reject) => {
      let last = -1;
      const child = fork(path.join(import.meta.dirname, 'crash-writer.child.mjs'), [file], {
        stdio: 'ignore',
      });
      child.on('message', (m: { committed: number }) => {
        last = m.committed;
        if (last >= 300) child.kill('SIGKILL'); // ohne Vorwarnung, wie ein Absturz
      });
      child.on('exit', () => resolve(last));
      setTimeout(() => reject(new Error('Schreibprozess antwortet nicht')), 30000);
    });

    const after = openDatabase(file);
    expect(checkIntegrity(after)).toEqual([]);
    const { n } = after.prepare('SELECT count(*) AS n FROM journal').get() as { n: number };
    after.close();
    // Alle bestätigten (0..last) sind da; höchstens eine weitere, noch nicht gemeldete
    expect(n).toBeGreaterThanOrEqual(lastConfirmed + 1);
    expect(n).toBeLessThanOrEqual(lastConfirmed + 2);
  }, 40000);
});
