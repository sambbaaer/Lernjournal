// Klartextprojektion eines Journals für den Suchindex (SPEC «Suche»):
// Titel + Abschnittstext und eigene Überschriften + Bildlegenden + Zuordnungen.
//
// Text und Bildlegenden kommen in getrennte Spalten. So kann die Suche
// melden, WO ein Begriff vorkam («Gefunden in: Bildlegende»), und Treffer im
// Titel höher gewichten als Treffer irgendwo im Fliesstext.
import { LEGACY_SECTION_KEYS, type LegacySections, type Sections } from '@shared/journal';
import { JOURNAL_TEMPLATES } from '@shared/journal-templates';
import { annotationTexts, parseAnnotations } from '@shared/annotations';
import { MARK_END, MARK_START } from '@shared/search';

const starterHeadings = Object.values(JOURNAL_TEMPLATES).flatMap((template) => template.sections);

export type SearchProjection = {
  title: string;
  body: string;
  captions: string;
  tags: string;
  categories: string;
};

// Die Markierungszeichen der Trefferanzeige dürfen im Index nicht vorkommen,
// sonst würde ein (z. B. eingefügtes) Steuerzeichen als Treffer markiert.
export function cleanIndexText(text: string): string {
  return text.replaceAll(MARK_START, ' ').replaceAll(MARK_END, ' ');
}

// Text eines Tiptap-Knotens ohne Bildlegenden; Legenden landen in «captions».
// Blöcke (Absätze, Listenpunkte, Tabellenzellen) werden mit Zeilenumbruch
// getrennt, damit Wörter benachbarter Blöcke nicht zusammenkleben.
function collect(node: unknown, body: string[], captions: string[]): void {
  if (!node || typeof node !== 'object') return;
  const n = node as { type?: string; text?: string; content?: unknown[]; attrs?: Record<string, unknown> };
  if (n.type === 'text') {
    body.push(n.text ?? '');
    return;
  }
  if (n.type === 'hardBreak') {
    body.push('\n');
    return;
  }
  if (n.type === 'figure') {
    const caption = n.attrs?.['caption'];
    if (typeof caption === 'string' && caption.trim()) captions.push(caption.trim());
    // Texte der Bild-Schnellbeschriftung (AJ-32) wie Legenden durchsuchbar
    captions.push(...annotationTexts(parseAnnotations(n.attrs?.['annotations'])));
  }
  // Rechenblock-Zeilen enthalten Text direkt (wie ein Absatz)
  const inline = n.type === 'paragraph' || n.type === 'heading' || n.type === 'calcLine';
  for (const child of Array.isArray(n.content) ? n.content : []) {
    collect(child, body, captions);
    if (!inline) body.push('\n');
  }
  if (inline) body.push('\n');
}

export function projectSections(sections: Sections | LegacySections): { body: string; captions: string } {
  const body: string[] = [];
  const captions: string[] = [];
  if (Array.isArray(sections)) {
    for (const { id, heading, doc } of sections) {
      // Vorlagenüberschriften kommen in vielen Journalen vor und sollen die
      // Ausschnitte der eigentlichen Lerndokumentation nicht verdrängen.
      if (heading && !starterHeadings.some((starter) => starter.key === id && starter.heading === heading)) {
        body.push(heading, '\n');
      }
      collect(doc, body, captions);
    }
  } else {
    // Beim Umstieg von Schema v1 baut Migration 2 den Index vor Migration 5 auf.
    for (const key of LEGACY_SECTION_KEYS) collect(sections[key], body, captions);
  }
  return {
    // Mehrfache Leerzeilen zusammenfassen (kleinerer Index, ruhigere Ausschnitte)
    body: cleanIndexText(body.join(''))
      .replace(/\n{2,}/g, '\n')
      .trim(),
    captions: cleanIndexText(captions.join('\n')),
  };
}
