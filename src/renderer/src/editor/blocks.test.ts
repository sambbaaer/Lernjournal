// Bausteine: nur erlaubte Knoten (dieselbe Prüfung wie im Hauptprozess)
import { describe, expect, it } from 'vitest';
import { validateSections } from '@shared/editor-schema';
import { BLOCKS, blockContent, troubleshootingTable } from './blocks';

describe('Bausteine', () => {
  it('Störungstabelle hat Kopfzeile Symptom → Ursache → Massnahme', () => {
    const table = troubleshootingTable();
    const head = table.content![0]!.content!.map((c) => c.content![0]!.content![0]!.text);
    expect(head).toEqual(['Symptom', 'Ursache', 'Massnahme']);
    expect(table.content).toHaveLength(3);
  });

  it('jeder Baustein besteht die Prüfung des Hauptprozesses', () => {
    for (const block of BLOCKS) {
      const doc = { type: 'doc' as const, content: [blockContent(block.id)] };
      expect(() => validateSections([{ id: 'auftrag', heading: null, doc }])).not.toThrow();
    }
  });
});
