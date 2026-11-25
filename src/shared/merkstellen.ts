// Merkstellen (AJ-33): markierte Textstellen mit Fachbegriff, die das
// Fachbuch als eigene Einträge zeigt. Typen und reine Hilfsfunktion – die
// Merkstellen werden bei jeder Abfrage frisch aus den Journalen gelesen
// (keine eigene Tabelle, keine Kopie: Fachbuch = Sicht).
import { z } from 'zod';
import { JOURNAL_STATUS } from './journal';

export const MerkstelleSchema = z.object({
  id: z.string(),
  term: z.string(),
  // Markierter Text (kann über mehrere Formatierungen gehen)
  text: z.string(),
  // Umgebender Absatz als Auszug (gekürzt)
  context: z.string(),
  journalId: z.string(),
  journalTitle: z.string(),
  workDate: z.string(),
  status: z.enum(JOURNAL_STATUS),
});
export type Merkstelle = z.infer<typeof MerkstelleSchema>;
export const MerkstellenSchema = z.array(MerkstelleSchema);

export const MAX_CONTEXT = 240;

type N = {
  type?: string;
  text?: string;
  content?: N[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
};

// Merkstellen eines Journals in Lesereihenfolge (eine Merkstelle = eine ID,
// auch wenn sie über mehrere Textstücke mit unterschiedlicher Formatierung geht)
export function collectMerkstellen(
  sections: readonly { doc: unknown }[],
): { id: string; term: string; text: string; context: string }[] {
  const found = new Map<string, { id: string; term: string; text: string; context: string }>();
  const blockText = (n: N): string =>
    n.type === 'text'
      ? (n.text ?? '')
      : n.type === 'hardBreak'
        ? ' '
        : (n.content ?? []).map(blockText).join('');
  const walk = (n: N, block: N | null) => {
    // Textblock (Absatz, Überschrift, Rechenzeile …) = Auszug für die Merkstelle
    const isTextblock = (n.content ?? []).some((c) => c.type === 'text' || c.type === 'hardBreak');
    const current = isTextblock ? n : block;
    if (n.type === 'text') {
      for (const m of n.marks ?? []) {
        if (m.type !== 'merkstelle') continue;
        const id = String(m.attrs?.['id'] ?? '');
        if (!id) continue;
        const entry = found.get(id);
        if (entry) entry.text += n.text ?? '';
        else {
          const ctx = current ? blockText(current).replace(/\s+/g, ' ').trim() : '';
          found.set(id, {
            id,
            term: String(m.attrs?.['term'] ?? '').trim(),
            text: n.text ?? '',
            context: ctx.length > MAX_CONTEXT ? `${ctx.slice(0, MAX_CONTEXT - 1)}…` : ctx,
          });
        }
      }
    }
    for (const c of n.content ?? []) walk(c, current);
  };
  for (const s of sections) walk(s.doc as N, null);
  return [...found.values()].map((e) => ({ ...e, text: e.text.replace(/\s+/g, ' ').trim() }));
}
