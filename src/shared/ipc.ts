// IPC-Vertrag: die EINZIGE Liste von Befehlen, die die Oberfläche (Renderer)
// beim Hauptprozess auslösen darf.
//
// Warum so streng? Der Renderer zeigt Inhalte an, die Lernende eintippen oder
// einfügen. Falls dort je Schadcode landet, soll er nichts anderes tun können
// als diese wenigen, geprüften Befehle aufrufen (SPEC «Sicherheit»).
//
// Für jeden Kanal definieren wir mit zod:
//   request  – was der Renderer schicken darf (wird im Hauptprozess geprüft)
//   response – was zurückkommt (Typ für den Renderer)
import { z } from 'zod';
import {
  JournalDetailSchema,
  JournalId,
  JournalMetaSchema,
  JournalSummarySchema,
  SectionsSchema,
} from './journal';

export const AppInfoSchema = z.object({
  name: z.string(),
  version: z.string(),
  platform: z.string(),
  versions: z.object({ electron: z.string(), chrome: z.string(), node: z.string() }),
});
export type AppInfo = z.infer<typeof AppInfoSchema>;

// --- Projekt und Profil (AJ-03) ---------------------------------------------

export const SPECIALIZATIONS = ['print', 'printmediatechnik', 'siebdruck'] as const;
export const SPECIALIZATION_LABELS: Record<(typeof SPECIALIZATIONS)[number], string> = {
  print: 'Print',
  printmediatechnik: 'Printmediatechnik',
  siebdruck: 'Siebdruck',
};

// Ein ISO-Datum «JJJJ-MM-TT», das es auch wirklich gibt (kein 30. Februar)
const IsoDate = z.string().refine((v) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}, 'Ungültiges Datum');

// Pfade: nur Länge begrenzen – ob der Pfad erlaubt ist, entscheidet der
// Hauptprozess (nur Ordner aus dem Dialog, der Zuletzt-Liste oder dem Vorschlag).
const FolderPath = z.string().min(1).max(1024);

export const ProfileSchema = z.object({
  displayName: z.string().trim().max(100),
  company: z.string().trim().max(150).nullable(),
  apprenticeshipStart: IsoDate.nullable(),
  specialization: z.enum(SPECIALIZATIONS),
});
export type Profile = z.infer<typeof ProfileSchema>;

export const ProjectInfoSchema = z.object({
  id: z.string(),
  title: z.string(),
  path: z.string(),
  createdAt: z.string(),
  profile: ProfileSchema,
  syncProvider: z.string().nullable(),
  journalCount: z.number().int(),
  // Wurde beim Öffnen auf ein neues Datenformat umgebaut? (Hinweis an Nutzer)
  migratedFromVersion: z.number().int().nullable(),
});
export type ProjectInfo = z.infer<typeof ProjectInfoSchema>;

export const RecentProjectSchema = z.object({ path: z.string(), title: z.string(), lastOpened: z.string() });

export const FolderKindSchema = z.enum([
  'new',
  'empty',
  'project',
  'not-empty',
  'not-allowed',
  'not-a-folder',
]);
export type FolderKind = z.infer<typeof FolderKindSchema>;

export const OpenResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('opened'), project: ProjectInfoSchema }),
  z.object({ status: z.literal('locked-here') }),
  z.object({
    status: z.literal('locked-elsewhere'),
    holder: z.object({ hostname: z.string(), startedAt: z.string() }).nullable(),
  }),
  z.object({ status: z.literal('newer-version'), message: z.string() }),
  z.object({ status: z.literal('not-a-project') }),
  z.object({ status: z.literal('not-allowed') }),
  z.object({ status: z.literal('corrupt'), problems: z.array(z.string()) }),
]);
export type OpenResult = z.infer<typeof OpenResultSchema>;

export const TaxonomyKind = z.enum(['category', 'tag']);
export const CategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  source: z.enum(['bipla', 'user']),
  sortOrder: z.number(),
  count: z.number(),
});
export const TagSchema = z.object({ id: z.string(), name: z.string(), count: z.number() });
export const TaxonomyListSchema = z.object({ categories: z.array(CategorySchema), tags: z.array(TagSchema) });
export type Category = z.infer<typeof CategorySchema>;
export type Tag = z.infer<typeof TagSchema>;

export const ipcContract = {
  // Liefert App-Version und Laufzeit – erster, harmloser Befehl, an dem
  // das ganze Sicherheitsmuster getestet wird.
  'app:getInfo': { request: z.undefined(), response: AppInfoSchema },

  // Antwort auf «Fenster wird geschlossen»: Ist alles gespeichert?
  'app:closeReady': { request: z.object({ saved: z.boolean() }), response: z.object({ ok: z.boolean() }) },

  // Aktuelles Projekt (oder keines), Zuletzt-Liste und vorgeschlagener Speicherort
  'project:getState': {
    request: z.undefined(),
    response: z.object({
      project: ProjectInfoSchema.nullable(),
      recent: z.array(RecentProjectSchema),
      suggestedLocation: z.string(),
    }),
  },
  // Nativer Windows-Ordnerdialog. null = abgebrochen.
  'project:chooseFolder': {
    request: z.object({ purpose: z.enum(['create', 'open']) }),
    response: z.object({ path: z.string().nullable() }),
  },
  // Was ist in diesem Ordner? (leer, schon ein Projekt …) + Cloud-Warnung
  'project:inspectFolder': {
    request: z.object({ path: FolderPath }),
    response: z.object({ kind: FolderKindSchema, syncProvider: z.string().nullable() }),
  },
  'project:create': {
    request: z.object({
      path: FolderPath,
      title: z.string().trim().min(1).max(120),
      profile: ProfileSchema,
      seedCategories: z.boolean(),
    }),
    response: OpenResultSchema,
  },
  'project:open': {
    request: z.object({ path: FolderPath, force: z.boolean().optional() }),
    response: OpenResultSchema,
  },
  'project:close': { request: z.undefined(), response: z.object({ closed: z.boolean() }) },
  'profile:update': { request: ProfileSchema, response: ProfileSchema },

  // --- Journale (AJ-05) ---
  'journal:list': {
    request: z.object({ includeArchived: z.boolean() }),
    response: z.array(JournalSummarySchema),
  },
  'journal:get': { request: z.object({ id: JournalId }), response: JournalDetailSchema },
  'journal:create': { request: z.undefined(), response: JournalDetailSchema },
  'journal:updateMeta': {
    request: z.object({ id: JournalId, meta: JournalMetaSchema }),
    response: JournalSummarySchema,
  },
  // Inhalt (Tiptap-JSON); der Hauptprozess prüft zusätzlich gegen das Editor-Schema
  'journal:updateSections': {
    request: z.object({ id: JournalId, sections: SectionsSchema }),
    response: JournalSummarySchema,
  },
  // Bild speichern: Bytes kommen bereits verkleinert und ohne Metadaten aus dem
  // Renderer; der Hauptprozess prüft Format und Masse selbst nochmals.
  'media:add': {
    request: z.object({
      journalId: JournalId,
      data: z
        .instanceof(Uint8Array)
        .refine((d) => d.byteLength > 0 && d.byteLength <= 15 * 1024 * 1024, 'Ungültige Grösse'),
      originalName: z.string().max(260),
    }),
    response: z.object({ id: z.string(), width: z.number(), height: z.number(), mime: z.string() }),
  },
  // --- Kategorien und Schlagwörter (AJ-09) ---
  'taxonomy:list': { request: z.undefined(), response: TaxonomyListSchema },
  'taxonomy:create': {
    request: z.object({ kind: TaxonomyKind, name: z.string().max(200) }),
    response: TaxonomyListSchema,
  },
  'taxonomy:rename': {
    request: z.object({ kind: TaxonomyKind, id: z.uuid(), name: z.string().max(200) }),
    response: TaxonomyListSchema,
  },
  'taxonomy:merge': {
    request: z.object({ kind: TaxonomyKind, sourceId: z.uuid(), targetId: z.uuid() }),
    response: TaxonomyListSchema,
  },
  'taxonomy:delete': {
    request: z.object({ kind: TaxonomyKind, id: z.uuid() }),
    response: TaxonomyListSchema,
  },
  'journal:setCategories': {
    request: z.object({ id: JournalId, categoryIds: z.array(z.uuid()).max(100) }),
    response: TaxonomyListSchema.extend({ journal: JournalSummarySchema }),
  },
  'journal:setTags': {
    request: z.object({ id: JournalId, tags: z.array(z.string().max(200)).max(30) }),
    response: TaxonomyListSchema.extend({ journal: JournalSummarySchema }),
  },
  'journal:setStatus': {
    request: z.object({ id: JournalId, status: z.enum(['draft', 'completed', 'archived']) }),
    response: JournalSummarySchema,
  },
  'journal:duplicate': { request: z.object({ id: JournalId }), response: JournalDetailSchema },
  'journal:delete': { request: z.object({ id: JournalId }), response: z.object({ deleted: z.boolean() }) },
} as const;

export type IpcChannel = keyof typeof ipcContract;
export type IpcRequest<C extends IpcChannel> = z.infer<(typeof ipcContract)[C]['request']>;
export type IpcResponse<C extends IpcChannel> = z.infer<(typeof ipcContract)[C]['response']>;

// Antworten kommen immer als Ergebnisobjekt zurück, nie als geworfener Fehler.
// So gelangen keine Stacktraces mit Dateipfaden in die Oberfläche, und die
// Oberfläche muss Fehler bewusst behandeln (z. B. «Speichern fehlgeschlagen»).
export type IpcErrorCode = 'INVALID_REQUEST' | 'FORBIDDEN' | 'UNKNOWN_CHANNEL' | 'INTERNAL';
export type IpcResult<T> =
  { ok: true; data: T } | { ok: false; error: { code: IpcErrorCode; message: string } };
