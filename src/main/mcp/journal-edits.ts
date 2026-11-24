import { createHash } from 'node:crypto';
import { Fragment, Mark, Node, Slice } from '@tiptap/pm/model';
import { z } from 'zod';
import { editorSchema, validateSections } from '@shared/editor-schema';
import { LEGACY_SECTION_KEYS, type JournalDetail, type Sections } from '@shared/journal';
import { newJournalSections } from '@shared/journal-templates';

export class McpError extends Error {
  override name = 'McpError';
}

const singleLine = (max: number) =>
  z
    .string()
    .max(max)
    .regex(/^[^\r\n]*$/u);
const sectionId = z.union([z.uuid(), z.enum(LEGACY_SECTION_KEYS)]);

export const EditSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('replace_text'),
    sectionId,
    before: singleLine(6000).min(1),
    after: singleLine(6000),
  }),
  z.strictObject({ kind: z.literal('append_paragraph'), sectionId, text: singleLine(6000).min(1) }),
]);

export const DraftTextSchema = z.strictObject({
  auftrag: z.string().max(12_000).optional(),
  durchfuehrung: z.string().max(12_000).optional(),
  reflexion: z.string().max(12_000).optional(),
});

type Edit = z.infer<typeof EditSchema>;

export function journalRevision({ title, sections }: JournalDetail): string {
  return createHash('sha256')
    .update(JSON.stringify([title, sections]))
    .digest('hex');
}

function uniqueRange(doc: Node, text: string) {
  let first: { from: number; to: number } | undefined;
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return;
    const block = node.textBetween(0, node.content.size, '', '\n');
    const index = block.indexOf(text);
    if (index < 0) return false;
    if (first || block.indexOf(text, index + 1) >= 0)
      throw new McpError('Die zu ersetzende Stelle ist mehrdeutig. Gib mehr Kontext in «before» an.');
    const from = pos + 1 + index;
    first = { from, to: from + text.length };
    return false;
  });
  if (!first) throw new McpError('Der Text wurde im Abschnitt innerhalb eines Absatzes nicht gefunden.');
  return first;
}

function editDocument(doc: Node, edit: Edit): Node {
  if (edit.kind === 'append_paragraph') {
    const paragraph = editorSchema.nodes['paragraph']!.create(null, editorSchema.text(edit.text));
    return doc.copy(doc.content.append(Fragment.from(paragraph)));
  }
  const { from, to } = uniqueRange(doc, edit.before);
  let marks: readonly Mark[] | undefined;
  doc.nodesBetween(from, to, (node) => {
    if (!node.isText) return;
    if (edit.after && marks && !Mark.sameSet(marks, node.marks))
      throw new McpError(
        'Die Stelle hat unterschiedliche Formatierungen. Teile die Überarbeitung in kleinere Stellen auf.',
      );
    marks = node.marks;
  });
  const replacement = edit.after
    ? new Slice(Fragment.from(editorSchema.text(edit.after, marks)), 0, 0)
    : Slice.empty;
  return doc.replace(from, to, replacement);
}

export function previewEdits(journal: JournalDetail, edits: Edit[]) {
  const sections = [...journal.sections];
  const changes = edits.map((edit) => {
    const index = sections.findIndex((section) => section.id === edit.sectionId);
    const section = sections[index];
    if (!section) throw new McpError('Der Abschnitt wurde nicht gefunden. Lies das Journal erneut.');
    const doc = Node.fromJSON(editorSchema, section.doc);
    const after = editDocument(doc, edit);
    if (!after.eq(doc)) sections[index] = { ...section, doc: after.toJSON() };
    return {
      section: section.heading ?? `Abschnitt ${index + 1}`,
      before: edit.kind === 'replace_text' ? edit.before : null,
      after: edit.kind === 'replace_text' ? edit.after : edit.text,
    };
  });
  validateSections(sections);
  if (journalRevision({ ...journal, sections }) === journalRevision(journal))
    throw new McpError('Der Vorschlag enthält keine Änderung.');
  return { sections, changes };
}

export function draftSections(text: z.infer<typeof DraftTextSchema> | undefined): Sections {
  return newJournalSections().map((section) => {
    const source = text?.[section.id as (typeof LEGACY_SECTION_KEYS)[number]];
    if (!source?.trim()) return section;
    const content = source.split(/\r\n|\n|\r/u).map((line) => ({
      type: 'paragraph',
      ...(line ? { content: [{ type: 'text', text: line }] } : {}),
    }));
    return { ...section, doc: { type: 'doc', content } };
  });
}
