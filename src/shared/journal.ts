// Journal-Typen für Hauptprozess und Oberfläche (SPEC «Journal»).
import { z } from 'zod';

export const JOURNAL_STATUS = ['draft', 'completed', 'archived'] as const;
export const LEARNING_PLACES = ['betrieb', 'uek', 'schule'] as const;
export type LearningPlace = (typeof LEARNING_PLACES)[number];

export const STATUS_LABELS: Record<(typeof JOURNAL_STATUS)[number], string> = {
  draft: 'Entwurf',
  completed: 'Abgeschlossen',
  archived: 'Archiviert',
};
export const LEARNING_PLACE_LABELS: Record<(typeof LEARNING_PLACES)[number], string> = {
  betrieb: 'Betrieb',
  uek: 'üK',
  schule: 'Berufsfachschule',
};

export const LEGACY_SECTION_KEYS = ['auftrag', 'durchfuehrung', 'reflexion'] as const;
export type LegacySectionKey = (typeof LEGACY_SECTION_KEYS)[number];

export const JOURNAL_TEMPLATE_IDS = ['report', 'blank', 'machine', 'workflow'] as const;
export const JournalTemplateIdSchema = z.enum(JOURNAL_TEMPLATE_IDS);
export type JournalTemplateId = z.infer<typeof JournalTemplateIdSchema>;
export const DEFAULT_JOURNAL_TEMPLATE = 'report';

export const JournalId = z.uuid();
export const IsoDateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// Tiptap-Dokument (Inhalt wird beim Speichern im Editor-Ticket AJ-06 genauer geprüft)
const TiptapDoc = z.object({ type: z.literal('doc') }).loose();
export type SectionDocument = z.infer<typeof TiptapDoc>;
export const SECTION_HEADING_MAX = 200;

export const LegacySectionsSchema = z.object({
  auftrag: TiptapDoc,
  durchfuehrung: TiptapDoc,
  reflexion: TiptapDoc,
});
export type LegacySections = z.infer<typeof LegacySectionsSchema>;

const SectionSchema = z.strictObject({
  id: z.union([z.enum(LEGACY_SECTION_KEYS), z.uuid()]),
  heading: z.string().trim().min(1).max(SECTION_HEADING_MAX).nullable(),
  doc: TiptapDoc,
});
export type JournalSection = z.infer<typeof SectionSchema>;
export const SectionsSchema = z
  .array(SectionSchema)
  .refine((sections) => new Set(sections.map(({ id }) => id)).size === sections.length);
export type Sections = z.infer<typeof SectionsSchema>;

export const JournalSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  template: JournalTemplateIdSchema,
  workDate: z.string(),
  status: z.enum(JOURNAL_STATUS),
  qvSelected: z.boolean(),
  learningPlace: z.enum(LEARNING_PLACES),
  schoolYear: z.number().int().nullable(), // wirksam (manuell oder berechnet)
  schoolYearOverride: z.number().int().nullable(),
  updatedAt: z.string(),
  completedAt: z.string().nullable(),
  // Zuordnungen (AJ-09): IDs in der Reihenfolge der Kategorienliste bzw. alphabetisch
  categoryIds: z.array(z.string()),
  tagIds: z.array(z.string()),
});
export type JournalSummary = z.infer<typeof JournalSummarySchema>;

export const JournalDetailSchema = JournalSummarySchema.extend({
  createdAt: z.string(),
  sections: SectionsSchema,
});
export type JournalDetail = z.infer<typeof JournalDetailSchema>;

export const JournalMetaSchema = z.object({
  title: z.string().max(200),
  workDate: IsoDateString,
  learningPlace: z.enum(LEARNING_PLACES),
  schoolYearOverride: z.number().int().min(1).max(4).nullable(),
});
export type JournalMeta = z.infer<typeof JournalMetaSchema>;

export const EMPTY_DOCUMENT: SectionDocument = { type: 'doc', content: [{ type: 'paragraph' }] };

export function withSectionDocument(sections: Sections, id: string, doc: SectionDocument): Sections {
  return sections.map((section) => (section.id === id ? { ...section, doc } : section));
}

// Beschriftungen der Bausteine im Klartext (MCP, Vorschau). Bewusst hier
// dupliziert statt aus editor-schema.ts importiert: journal.ts bleibt ohne Tiptap.
const CALC_TEXT: Record<string, string> = {
  given: 'Gegeben',
  formula: 'Formel',
  steps: 'Rechnung',
  result: 'Ergebnis',
};
const CALLOUT_TEXT: Record<string, string> = { merke: 'Merke', achtung: 'Achtung', tipp: 'Tipp' };

// Reiner Text eines Tiptap-Dokuments (für Vorschau und MCP)
export function plainTextOf(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const n = node as { type?: string; text?: string; content?: unknown[]; attrs?: Record<string, unknown> };
  if (n.type === 'text') return n.text ?? '';
  if (n.type === 'hardBreak') return '\n';
  let own = '';
  if (n.type === 'figure') {
    const caption = typeof n.attrs?.['caption'] === 'string' ? n.attrs['caption'] : '';
    // Texte der Bildbeschriftung (AJ-32) gehören zum Bild
    const notes = Array.isArray(n.attrs?.['annotations'])
      ? (n.attrs['annotations'] as { type?: string; text?: unknown }[])
          .filter((a) => a.type === 'text' && typeof a.text === 'string')
          .map((a) => a.text as string)
      : [];
    own = [caption, ...notes].filter(Boolean).join('\n');
  }
  if (n.type === 'callout') own = `${CALLOUT_TEXT[String(n.attrs?.['kind'])] ?? 'Hinweis'}:`;
  const children = Array.isArray(n.content) ? n.content.map(plainTextOf) : [];
  const inline = n.type === 'paragraph' || n.type === 'heading' || n.type === 'calcLine';
  let joined = children.join(inline ? '' : '\n');
  if (n.type === 'calcLine') joined = `${CALC_TEXT[String(n.attrs?.['role'])] ?? ''}: ${joined}`;
  if (n.type === 'taskItem') joined = `${n.attrs?.['checked'] === true ? '☑' : '☐'} ${joined}`;
  return [own, joined].filter(Boolean).join('\n');
}
