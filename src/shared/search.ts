// Fachbuch-Suche (AJ-11) – Typen und reine Hilfsfunktionen für Hauptprozess
// und Oberfläche.
//
// Die Suche läuft im Hauptprozess über SQLite FTS5 (Tabelle journal_fts). Der
// Index ist eine ABGELEITETE Klartext-Kopie (Titel, Text, Bildlegenden,
// Schlagwörter, Kategorien) und lässt sich jederzeit aus den Journalen neu
// aufbauen – er ist nie die Quelle von Daten (SPEC «Suche»).
import { z } from 'zod';

// --- Markierung der Treffer ------------------------------------------------------
//
// FTS5 umschliesst Treffer in highlight()/snippet() mit frei wählbaren Zeichen.
// Wir nehmen zwei Steuerzeichen statt HTML (<mark>): So kann ein Journaltext
// wie «<b>» nie als HTML in der Oberfläche landen, und die Oberfläche baut die
// Markierung selbst als React-Elemente. Im Suchindex werden diese beiden
// Zeichen vorher entfernt (cleanIndexText), damit sie eindeutig bleiben.
export const MARK_START = '\u0002';
export const MARK_END = '\u0003';

export type MarkedSegment = { text: string; hit: boolean };

// «Die \u0002Farbmessung\u0003 ist …» → [{Die }, {Farbmessung, hit}, { ist …}]
export function parseMarked(marked: string): MarkedSegment[] {
  const out: MarkedSegment[] = [];
  let hit = false;
  let buf = '';
  const flush = () => {
    if (buf) out.push({ text: buf, hit });
    buf = '';
  };
  for (const ch of marked) {
    if (ch === MARK_START) {
      flush();
      hit = true;
    } else if (ch === MARK_END) {
      flush();
      hit = false;
    } else {
      buf += ch;
    }
  }
  flush();
  // Benachbarte Stücke gleicher Art zusammenfassen («\u0002a\u0003\u0002b\u0003»)
  return out.reduce<MarkedSegment[]>((acc, s) => {
    const last = acc[acc.length - 1];
    if (last && last.hit === s.hit) last.text += s.text;
    else acc.push({ ...s });
    return acc;
  }, []);
}

// Text ohne Markierungen (z. B. für Tooltips oder Vergleiche in Tests)
export function stripMarks(marked: string): string {
  return marked.replaceAll(MARK_START, '').replaceAll(MARK_END, '');
}

// --- Felder des Suchindex --------------------------------------------------------

export const SEARCH_FIELDS = ['title', 'body', 'captions', 'tags', 'categories'] as const;
export type SearchField = (typeof SEARCH_FIELDS)[number];

export const SEARCH_FIELD_LABELS: Record<SearchField, string> = {
  title: 'Titel',
  body: 'Text',
  captions: 'Bildlegende',
  tags: 'Schlagwort',
  categories: 'Kategorie',
};

// --- Suchbegriffe ------------------------------------------------------------------
//
// Gemeinsam für Hauptprozess (baut die Abfrage) und Oberfläche (zeigt «mind.
// 3 Zeichen», ohne erst zu suchen) – damit beide dieselben Wörter sehen.

// Der Index (Trigramm) findet erst Wörter ab 3 Zeichen
export const MIN_WORD_LENGTH = 3;
// Höchstens so viele Wörter bzw. Zeichen je Wort – schützt vor riesigen Abfragen
export const MAX_QUERY_WORDS = 8;
const MAX_WORD_LENGTH = 40;

// Wörter der Eingabe: Folgen von Buchstaben und Ziffern (Unicode), klein
// geschrieben, ohne Doppelte. Alles andere trennt («Farb-Messung» → «farb»,
// «messung»); Satzzeichen und Sonderzeichen werden nie gesucht.
export function queryWords(input: string): string[] {
  const words =
    input
      .normalize('NFC')
      .toLocaleLowerCase('de-CH')
      .match(/[\p{L}\p{N}]+/gu) ?? [];
  return [...new Set(words.map((w) => w.slice(0, MAX_WORD_LENGTH)))];
}

// Wörter, nach denen tatsächlich gesucht wird (mind. 3 Zeichen, höchstens 8)
export function searchableWords(input: string): string[] {
  return queryWords(input)
    .filter((w) => w.length >= MIN_WORD_LENGTH)
    .slice(0, MAX_QUERY_WORDS);
}

// --- IPC-Daten ---------------------------------------------------------------------

export const SEARCH_QUERY_MAX = 200;

export const SearchRequestSchema = z.object({
  query: z.string().max(SEARCH_QUERY_MAX),
  includeArchived: z.boolean(),
});
export type SearchRequest = z.infer<typeof SearchRequestSchema>;

export const SearchHitSchema = z.object({
  id: z.string(),
  // Titel mit markierten Treffern (MARK_START/MARK_END)
  title: z.string(),
  // Ausschnitt aus Text oder Bildlegenden mit markierten Treffern; null, wenn
  // der Begriff nur in Titel, Schlagwort oder Kategorie vorkommt
  snippet: z.object({ field: z.enum(['body', 'captions']), text: z.string() }).nullable(),
  // In welchen Feldern kam der Begriff vor? («Gefunden in: Text, Bildlegende»)
  matchedIn: z.array(z.enum(SEARCH_FIELDS)),
});
export type SearchHit = z.infer<typeof SearchHitSchema>;

export const SearchResultSchema = z.object({
  // Beste Treffer zuerst (Titel zählt mehr als Schlagwort, das mehr als Text …)
  hits: z.array(SearchHitSchema),
  // Mehr Treffer als angezeigt? (Obergrenze schützt vor sehr langen Listen)
  truncated: z.boolean(),
});
export type SearchResult = z.infer<typeof SearchResultSchema>;

export const EMPTY_SEARCH_RESULT: SearchResult = { hits: [], truncated: false };
