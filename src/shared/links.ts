// Journal-Verknüpfungen (AJ-10) – Typen und reine Hilfsfunktionen für
// Hauptprozess und Oberfläche.
//
// Zwei Arten, Journale zu verbinden – beide ohne Kopien (SPEC «Fachbuch
// speichert keine Kopien»), es wird immer nur die ID des Ziels gespeichert:
//  1. Verknüpfung (Tabelle journal_link): «Dieses Journal gehört zu jenem».
//     Gespeichert in EINER Richtung, angezeigt in BEIDEN Journalen
//     (Rückverweis). Wer sie angelegt hat, spielt für Lernende keine Rolle.
//  2. Link im Text (Tiptap-Link mit href «lernjournal://journal/<uuid>»):
//     ein Wort im Fliesstext zeigt auf ein anderes Journal. Das Zieljournal
//     zeigt dafür «Erwähnt in …» an (Rückverweis aus dem Text).
import { z } from 'zod';
import { JOURNAL_STATUS } from './journal';

export const JOURNAL_LINK_PREFIX = 'lernjournal://journal/';

// UUID (wie von randomUUID() erzeugt), klein oder gross geschrieben
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const JOURNAL_HREF = new RegExp(`^lernjournal://journal/(${UUID})$`, 'i');

// Link-Ziel für einen Link im Text
export function journalLinkHref(journalId: string): string {
  return `${JOURNAL_LINK_PREFIX}${journalId}`;
}

// Journal-ID aus einem Link-Ziel – oder null, wenn es kein (gültiger) Journal-Link ist
export function journalIdFromHref(href: unknown): string | null {
  if (typeof href !== 'string') return null;
  const m = JOURNAL_HREF.exec(href);
  return m ? m[1]!.toLowerCase() : null;
}

// Querverweis auf ein Schlagwort (AJ-27, «[[Begriff]]»): führt in die
// Themenansicht des Fachbuchs. Gespeichert wird nur die ID des Schlagworts.
export const TAG_LINK_PREFIX = 'lernjournal://tag/';
const TAG_HREF = new RegExp(`^lernjournal://tag/(${UUID})$`, 'i');

export function tagLinkHref(tagId: string): string {
  return `${TAG_LINK_PREFIX}${tagId}`;
}

export function tagIdFromHref(href: unknown): string | null {
  if (typeof href !== 'string') return null;
  const m = TAG_HREF.exec(href);
  return m ? m[1]!.toLowerCase() : null;
}

// Alle Journale, auf die ein Tiptap-Dokument (oder alle drei Abschnitte) im
// Text verweist. Läuft rekursiv durch den ganzen JSON-Baum, ohne Tiptap zu
// brauchen: Jede Link-Markierung { type: 'link', attrs: { href } } zählt.
export function journalLinkTargets(node: unknown, found = new Set<string>()): Set<string> {
  if (!node || typeof node !== 'object') return found;
  const n = node as { type?: unknown; attrs?: { href?: unknown } };
  if (n.type === 'link') {
    const id = journalIdFromHref(n.attrs?.href);
    if (id) found.add(id);
  }
  for (const v of Object.values(node)) journalLinkTargets(v, found);
  return found;
}

// Entfernt Text-Links auf ein bestimmtes Journal (z. B. weil es gelöscht wird).
// Der Text selbst bleibt stehen, nur die Verlinkung verschwindet. Liefert eine
// neue Struktur und lässt die übergebene unverändert (keine Nebeneffekte).
export function stripJournalLinks<T>(node: T, targetId: string): T {
  const target = targetId.toLowerCase();
  const walk = (n: unknown): unknown => {
    if (Array.isArray(n)) return n.map(walk);
    if (!n || typeof n !== 'object') return n;
    const copy: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(n as Record<string, unknown>)) {
      if (k === 'marks' && Array.isArray(v)) {
        const kept = v.filter(
          (m: { type?: string; attrs?: { href?: unknown } }) =>
            !(m?.type === 'link' && journalIdFromHref(m.attrs?.href) === target),
        );
        // Leere marks-Liste weglassen (so speichert Tiptap Text ohne Formatierung)
        if (kept.length > 0) copy[k] = kept;
      } else {
        copy[k] = walk(v);
      }
    }
    return copy;
  };
  return walk(node) as T;
}

// --- Daten für die Oberfläche ---------------------------------------------------

// Kurzangaben zu einem verknüpften Journal (Titel kommt immer frisch aus der
// Datenbank – wird ein Titel geändert, zeigen alle Verweise sofort den neuen)
export const LinkedJournalSchema = z.object({
  id: z.string(),
  title: z.string(),
  workDate: z.string(),
  status: z.enum(JOURNAL_STATUS),
});
export type LinkedJournal = z.infer<typeof LinkedJournalSchema>;

export const JournalLinksSchema = z.object({
  // Verknüpfungen in beiden Richtungen, neuestes Arbeitsdatum zuerst
  linked: z.array(LinkedJournalSchema),
  // Journale, die im Text auf dieses Journal verlinken (Rückverweise)
  mentionedIn: z.array(LinkedJournalSchema),
});
export type JournalLinks = z.infer<typeof JournalLinksSchema>;

export const EMPTY_LINKS: JournalLinks = { linked: [], mentionedIn: [] };

// --- Suche in der Link-Auswahl ---------------------------------------------------

// Vergleichsform für die Suche: ohne Gross/Klein und ohne Akzente/Umlaut-Punkte
// («Überfüller» findet «uberfuller», «ueberfueller» und «ÜBERFÜLLER»).
export function searchKey(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('de-CH')
    .replace(/ß/g, 'ss')
    .replace(/\s+/g, ' ')
    .trim();
}

// Umlaut-Umschreibungen (ae/oe/ue) zusätzlich als einfache Vokale erkennen:
// «Ueberfueller» → «uberfuller». Nur für den Suchbegriff, nicht für den Text.
function spellingVariants(word: string): string[] {
  const simple = word.replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u');
  return simple === word ? [word] : [word, simple];
}

export type LinkCandidate = {
  id: string;
  title: string;
  workDate: string;
  // Weitere Suchtexte, z. B. Namen der Schlagwörter und Kategorien
  extra: string[];
};

// Filtert Journale für die Link-Auswahl. Alle Wörter der Eingabe müssen
// vorkommen (in Titel, Datum oder Zusatztexten), Reihenfolge egal. Treffer im
// Titel kommen zuerst, sonst neuestes Arbeitsdatum zuerst. Leere Eingabe: alle.
export function filterLinkCandidates<T extends LinkCandidate>(candidates: T[], query: string): T[] {
  const words = searchKey(query).split(' ').filter(Boolean);
  const scored: { c: T; inTitle: boolean }[] = [];
  for (const c of candidates) {
    const title = searchKey(c.title);
    // Datum auch in Schweizer Schreibweise durchsuchbar («14.03.2026»)
    const [y, m, d] = c.workDate.split('-');
    const haystack = [title, c.workDate, `${d}.${m}.${y}`, ...c.extra.map(searchKey)].join(' | ');
    const matches = words.every((w) => spellingVariants(w).some((v) => haystack.includes(v)));
    if (!matches) continue;
    const inTitle =
      words.length > 0 && words.every((w) => spellingVariants(w).some((v) => title.includes(v)));
    scored.push({ c, inTitle });
  }
  return scored
    .sort((a, b) => Number(b.inTitle) - Number(a.inTitle) || b.c.workDate.localeCompare(a.c.workDate))
    .map((s) => s.c);
}
