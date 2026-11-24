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

export const SECTION_KEYS = ['auftrag', 'durchfuehrung', 'reflexion'] as const;
export const SECTION_TITLES: Record<(typeof SECTION_KEYS)[number], string> = {
  auftrag: 'Auftrag / Ausgangslage',
  durchfuehrung: 'Durchführung',
  reflexion: 'Reflexion',
};

export const JournalId = z.uuid();
export const IsoDateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// Tiptap-Dokument (Inhalt wird beim Speichern im Editor-Ticket AJ-06 genauer geprüft)
const TiptapDoc = z.object({ type: z.literal('doc') }).loose();
export const SectionsSchema = z.object({
  auftrag: TiptapDoc,
  durchfuehrung: TiptapDoc,
  reflexion: TiptapDoc,
});
export type Sections = z.infer<typeof SectionsSchema>;

export const JournalSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  workDate: z.string(),
  status: z.enum(JOURNAL_STATUS),
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

export const EMPTY_SECTIONS: Sections = {
  auftrag: { type: 'doc', content: [{ type: 'paragraph' }] },
  durchfuehrung: { type: 'doc', content: [{ type: 'paragraph' }] },
  reflexion: { type: 'doc', content: [{ type: 'paragraph' }] },
};

// Reiner Text eines Tiptap-Dokuments (für Suchindex und Vorschau)
export function plainTextOf(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const n = node as { type?: string; text?: string; content?: unknown[]; attrs?: Record<string, unknown> };
  if (n.type === 'text') return n.text ?? '';
  if (n.type === 'hardBreak') return '\n';
  const own = n.type === 'figure' && typeof n.attrs?.['caption'] === 'string' ? n.attrs['caption'] : '';
  const children = Array.isArray(n.content) ? n.content.map(plainTextOf) : [];
  const joined = children.join(n.type === 'paragraph' || n.type === 'heading' ? '' : '\n');
  return [own, joined].filter(Boolean).join('\n');
}
