// Schnellsuche Strg+K (AJ-26) – reine Logik, ohne Oberfläche testbar.
//
// Eine Eingabe, vier Arten von Treffern (in dieser Reihenfolge):
//   1. Journale    – Titel, Datum, Kategorien, Schlagwörter (sofort, im Renderer)
//   2. Themen      – Kategorien und Schlagwörter → Themenansicht im Fachbuch
//   3. Im Text     – Volltext über den bestehenden FTS5-Index (AJ-11, Hauptprozess)
//   4. Befehle     – «Neues Journal», «Exportieren» …
// Ein neuer Index ist nicht nötig: Die Suche nutzt, was Fachbuch und
// Link-Auswahl schon haben.
import type { JournalSummary } from '@shared/journal';
import { filterLinkCandidates, searchKey } from '@shared/links';
import type { SearchHit } from '@shared/search';
import type { Taxonomy } from '@shared/taxonomy';

export type QuickCommandId =
  'new-journal' | 'start' | 'journale' | 'fachbuch' | 'export' | 'settings' | 'mcp' | 'archive';

export type QuickItem =
  | { kind: 'journal'; id: string; label: string; detail: string }
  | { kind: 'category'; id: string; label: string; detail: string }
  | { kind: 'tag'; id: string; label: string; detail: string }
  | { kind: 'text'; id: string; label: string; detail: string }
  | { kind: 'command'; id: QuickCommandId; label: string; detail: string };

export const QUICK_GROUP_LABELS: Record<QuickItem['kind'], string> = {
  journal: 'Journale',
  category: 'Themen',
  tag: 'Themen',
  text: 'Im Text gefunden',
  command: 'Befehle',
};

// Befehle mit zusätzlichen Suchwörtern («pdf» findet «Exportieren»)
export const QUICK_COMMANDS: { id: QuickCommandId; label: string; keywords: string }[] = [
  { id: 'new-journal', label: 'Neues Journal', keywords: 'anlegen erstellen lernbericht' },
  { id: 'start', label: 'Startseite', keywords: 'dashboard übersicht fortschritt' },
  { id: 'journale', label: 'Alle Journale', keywords: 'liste filter' },
  { id: 'fachbuch', label: 'Fachbuch', keywords: 'nachschlagen themen merkstellen' },
  { id: 'export', label: 'Exportieren', keywords: 'word pdf docx qv sammlung drucken' },
  { id: 'settings', label: 'Einstellungen', keywords: 'kategorien profil sicherung darstellung' },
  { id: 'mcp', label: 'MCP-Einstellungen', keywords: 'claude ki assistent' },
  { id: 'archive', label: 'Projekt übergeben (.ajournal)', keywords: 'usb kopie computer umzug' },
];

const MAX_JOURNALS = 8;
const MAX_TOPICS = 5;
const MAX_TEXT = 8;

function allWordsIn(haystack: string, query: string): boolean {
  const words = searchKey(query).split(' ').filter(Boolean);
  const hay = searchKey(haystack);
  return words.length > 0 && words.every((w) => hay.includes(w));
}

export function buildQuickResults(input: {
  query: string;
  journals: readonly JournalSummary[];
  taxonomy: Taxonomy;
  textHits: readonly SearchHit[];
  formatDate: (iso: string) => string;
  displayTitle: (title: string) => string;
}): QuickItem[] {
  const { query, journals, taxonomy, textHits, formatDate, displayTitle } = input;
  const q = query.trim();
  const cat = new Map(taxonomy.categories.map((c) => [c.id, c.name]));
  const tag = new Map(taxonomy.tags.map((t) => [t.id, t.name]));
  // Archivierte nur über die Volltextsuche (wie im Fachbuch standardmässig)
  const active = journals.filter((j) => j.status !== 'archived');

  // Ohne Eingabe: zuletzt bearbeitete Journale und alle Befehle
  if (!q) {
    const recent = [...active].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);
    return [
      ...recent.map((j) => journalItem(j, formatDate, displayTitle)),
      ...QUICK_COMMANDS.map(commandItem),
    ];
  }

  const candidates = active.map((j) => ({
    ...j,
    title: displayTitle(j.title),
    extra: [...j.categoryIds.map((id) => cat.get(id) ?? ''), ...j.tagIds.map((id) => tag.get(id) ?? '')],
  }));
  const foundJournals = filterLinkCandidates(candidates, q).slice(0, MAX_JOURNALS);
  const shown = new Set(foundJournals.map((j) => j.id));

  const count = (pred: (j: JournalSummary) => boolean) => active.filter(pred).length;
  const topics: QuickItem[] = [
    ...taxonomy.categories
      .filter((c) => allWordsIn(c.name, q))
      .map((c) => ({
        kind: 'category' as const,
        id: c.id,
        label: c.name,
        detail: `Kategorie · ${count((j) => j.categoryIds.includes(c.id))} Journale`,
      })),
    ...taxonomy.tags
      .filter((t) => allWordsIn(t.name, q))
      .map((t) => ({
        kind: 'tag' as const,
        id: t.id,
        label: t.name,
        detail: `Schlagwort · ${count((j) => j.tagIds.includes(t.id))} Journale`,
      })),
  ].slice(0, MAX_TOPICS);

  // Volltext: nur Journale, die nicht schon oben stehen
  const text: QuickItem[] = textHits
    .filter((h) => !shown.has(h.id))
    .slice(0, MAX_TEXT)
    .map((h) => {
      const j = journals.find((x) => x.id === h.id);
      return {
        kind: 'text' as const,
        id: h.id,
        label: displayTitle(j?.title ?? ''),
        detail: h.snippet ? h.snippet.text : 'Treffer in Titel, Schlagwort oder Kategorie',
      };
    });

  const commands = QUICK_COMMANDS.filter((c) => allWordsIn(`${c.label} ${c.keywords}`, q)).map(commandItem);

  return [
    ...foundJournals.map((j) => journalItem(j, formatDate, displayTitle)),
    ...topics,
    ...text,
    ...commands,
  ];
}

function journalItem(
  j: JournalSummary,
  formatDate: (iso: string) => string,
  displayTitle: (t: string) => string,
): QuickItem {
  return { kind: 'journal', id: j.id, label: displayTitle(j.title), detail: formatDate(j.workDate) };
}

function commandItem(c: (typeof QUICK_COMMANDS)[number]): QuickItem {
  return { kind: 'command', id: c.id, label: c.label, detail: 'Befehl' };
}
