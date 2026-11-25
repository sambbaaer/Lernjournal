// Merkstellen (AJ-33): aus den gespeicherten Journalen gelesen, ohne Kopie
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getSchemaVersion, LATEST_VERSION } from '../db/migrations';
import { doc, newProjectService, projectServices, type ProjectServices } from '../test-project';
import { MerkstellenService } from './merkstellen-service';

const mark = (text: string, id: string, term: string) => ({
  type: 'text',
  text,
  marks: [{ type: 'merkstelle', attrs: { id, term } }],
});
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

describe('Merkstellen', () => {
  let dir: string;
  let s: ProjectServices;

  beforeEach(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'lj-merk-'));
    s = projectServices(newProjectService());
    await s.projects.create({
      dir: path.join(dir, 'p'),
      title: 'Test',
      profile: { displayName: 'Lea', company: null, apprenticeshipStart: null, specialization: 'print' },
      seedCategories: false,
    });
  });

  afterEach(() => {
    s.projects.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('listet Merkstellen alphabetisch mit Journal, Text und Absatz', () => {
    const j1 = s.journals.create({ title: 'Druckabnahme', workDate: '2026-03-01' });
    const j2 = s.journals.create({ title: 'Ohne Merkstellen', workDate: '2026-03-02' });
    s.journals.updateSections(j1.id, [
      {
        id: 'auftrag',
        heading: null,
        doc: doc(
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Bei 40 % ist die ' },
              mark('Tonwertzunahme', A, 'Tonwertzunahme'),
              { type: 'text', text: ' 14 %.' },
            ],
          },
          { type: 'paragraph', content: [mark('ΔE unter 3', B, 'Farbabstand')] },
        ),
      },
    ]);
    void j2;
    const list = new MerkstellenService(() => s.projects.db).list();
    expect(list.map((m) => m.term)).toEqual(['Farbabstand', 'Tonwertzunahme']);
    expect(list[1]).toMatchObject({
      id: A,
      text: 'Tonwertzunahme',
      context: 'Bei 40 % ist die Tonwertzunahme 14 %.',
      journalId: j1.id,
      journalTitle: 'Druckabnahme',
      status: 'draft',
    });
  });

  it('neue Projekte haben das Datenformat der neuen Bausteine', () => {
    expect(getSchemaVersion(s.projects.db)).toBe(LATEST_VERSION);
    expect(LATEST_VERSION).toBeGreaterThanOrEqual(7);
  });
});
