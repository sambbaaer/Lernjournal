// Selbsttest (AJ-16) mit der gebauten App (out/): derselbe Ablauf, den die
// Windows-CI mit der gepackten EXE ausführt – Projekt anlegen, Journal mit Bild,
// Suche, Word- und .ajournal-Export, Neustart, Import – samt Netzwerkprotokoll.
// Die Fuse-Phase gibt es nur für das gepackte Programm (hier keine Fuses).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runSelfTest } from '../scripts/self-test.mjs';

const electronPath = createRequire(import.meta.url)('electron');

test('Selbsttest: anlegen, Neustart, ohne Verbindung ins Netz', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'lj-selbsttest-'));
  const { pass, results } = await runSelfTest({
    exe: electronPath,
    app: '.',
    dir,
    phases: ['create', 'reopen'],
    expectDistribution: 'entwicklung',
  });
  for (const r of results) {
    assert.deepEqual(r.problems, [], `${r.phase}: ${r.problems.join('; ')}\n${r.output}`);
    assert.deepEqual(r.network, []);
    assert.equal(r.report.environment.packaged, false);
  }
  assert.equal(pass, true);
  const create = results[0].report;
  assert.match(create.steps.docx.fileName, /Offline-Selbsttest\.docx$/);
  assert.match(create.steps.pdf.fileName, /Offline-Selbsttest\.pdf$/);
  assert.match(create.steps.mcp, /^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
  assert.equal(create.steps.archive.journals, 1);
  assert.equal(results[1].report.steps.backups > 0, true);
});
