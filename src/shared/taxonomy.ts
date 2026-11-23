// Kategorien und Schlagwörter (AJ-09) – Typen und Namensregeln für
// Hauptprozess und Oberfläche.
//
// Unterschied (SPEC «Begriffe»):
//  - Kategorie = fester Ordnungsbegriff, z. B. die Handlungskompetenzbereiche
//    a–g aus dem Bildungsplan (R-05). Bleibt bestehen, auch ohne Journal.
//  - Schlagwort = freies Stichwort, das beim Schreiben entsteht («Farbmessung»).
//    Wird automatisch entfernt, sobald kein Journal es mehr nutzt – so wächst
//    keine Liste mit Tippfehlern und Einmal-Wörtern heran.
// Alle Zuordnungen sind freiwillig (Leitprinzip Einfachheit).
import { z } from 'zod';

export const CATEGORY_NAME_MAX = 120; // längster Bereich a–g hat ~75 Zeichen
export const TAG_NAME_MAX = 60;

// Namen vereinheitlichen: Unicode-NFC (sonst sind «ä» als ein oder zwei
// Zeichen verschieden), Leerraum zusammenfassen, Ränder weg.
export function normalizeName(raw: string): string {
  return raw.normalize('NFC').replace(/\s+/g, ' ').trim();
}

// Schlagwörter zusätzlich ohne führendes «#» (Gewohnheit aus Social Media)
export function normalizeTagName(raw: string): string {
  // Erst Ränder entfernen, sonst bliebe « #CTP» mit «#» stehen
  return normalizeName(normalizeName(raw).replace(/^#+/, ''));
}

// Vergleich ohne Gross-/Kleinschreibung – auch für Umlaute. SQLite-NOCASE
// kennt nur A–Z, darum prüfen wir zusätzlich im Code («Ölfarbe» = «ölfarbe»).
export function nameKey(name: string): string {
  return normalizeName(name).toLocaleLowerCase('de-CH');
}

// zod-Schemas prüfen die Namen schon an der IPC-Grenze
export const CategoryName = z
  .string()
  .transform(normalizeName)
  .pipe(z.string().min(1, 'Name fehlt').max(CATEGORY_NAME_MAX));

// Komma ist im Schlagwort-Feld das Trennzeichen und darum nicht erlaubt
export const TagName = z
  .string()
  .transform(normalizeTagName)
  .pipe(
    z
      .string()
      .min(1, 'Schlagwort fehlt')
      .max(TAG_NAME_MAX)
      .refine((v) => !v.includes(','), 'Komma nicht erlaubt'),
  );

export const CategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  source: z.enum(['bipla', 'user']),
  sortOrder: z.number().int(),
  journalCount: z.number().int(), // inkl. archivierte Journale
});
export type Category = z.infer<typeof CategorySchema>;

export const TagSchema = z.object({
  id: z.string(),
  name: z.string(),
  journalCount: z.number().int(),
});
export type Tag = z.infer<typeof TagSchema>;

export const TaxonomySchema = z.object({
  categories: z.array(CategorySchema),
  tags: z.array(TagSchema),
  // Wie viele der Vorschlag-Kategorien a–g fehlen (z. B. im Assistenten abgewählt)?
  missingSuggestions: z.number().int(),
});
export type Taxonomy = z.infer<typeof TaxonomySchema>;

export const TAXONOMY_KINDS = ['category', 'tag'] as const;
export type TaxonomyKind = (typeof TAXONOMY_KINDS)[number];

export const EMPTY_TAXONOMY: Taxonomy = { categories: [], tags: [], missingSuggestions: 0 };
