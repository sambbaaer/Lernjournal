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
  JournalTemplateIdSchema,
  SectionsSchema,
} from './journal';
import { ArchiveExportResultSchema, ArchivePreviewSchema } from './archive';
import {
  BackupCreateResultSchema,
  BackupEntrySchema,
  BackupId,
  BackupListSchema,
  BackupPreviewSchema,
  RESTORE_MODES,
} from './backup';
import { COLLECTION_LIMITS, ExportResultSchema } from './export';
import { JournalLinksSchema } from './links';
import { McpDecisionResultSchema, McpDecisionSchema, McpStatusSchema } from './mcp';
import { SearchRequestSchema, SearchResultSchema } from './search';
import { CategoryName, TAXONOMY_KINDS, TagName, TaxonomySchema } from './taxonomy';

const TaxonomyId = z.uuid();

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
  // Erinnerung an die Projektübergabe (AJ-15): letzte .ajournal-Übergabe und
  // «Später erinnern» bis (ISO, UTC; null = nie bzw. nicht ausgeblendet)
  lastExportAt: z.string().nullable(),
  exportReminderUntil: z.string().nullable(),
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

const CollectionExportRequest = z.object({
  ids: z
    .array(JournalId)
    .min(1)
    .max(COLLECTION_LIMITS.maxJournals)
    .refine((ids) => new Set(ids).size === ids.length, 'Ein Journal ist doppelt ausgewählt'),
  title: z.string().trim().max(COLLECTION_LIMITS.maxTitleLength),
  noticeAccepted: z.literal(true),
});

export const ipcContract = {
  // Liefert App-Version und Laufzeit – erster, harmloser Befehl, an dem
  // das ganze Sicherheitsmuster getestet wird.
  'app:getInfo': { request: z.undefined(), response: AppInfoSchema },

  // Antwort auf «Fenster wird geschlossen»: Ist alles gespeichert?
  'app:closeReady': { request: z.object({ saved: z.boolean() }), response: z.object({ ok: z.boolean() }) },
  'app:pasteInEditor': {
    request: z.strictObject({ plainText: z.boolean().optional() }).optional(),
    response: z.boolean(),
  },
  // Geöffneten Projektordner im Windows-Explorer anzeigen (ohne Pfad vom Renderer)
  'project:showFolder': { request: z.undefined(), response: z.object({ shown: z.boolean() }) },

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
  // Erinnerung an die Projektübergabe ausblenden («Später erinnern», AJ-15)
  'project:snoozeExportReminder': {
    request: z.undefined(),
    response: z.object({ exportReminderUntil: z.string() }),
  },
  'profile:update': { request: ProfileSchema, response: ProfileSchema },

  // --- Journale (AJ-05) ---
  'journal:list': {
    request: z.object({ includeArchived: z.boolean() }),
    response: z.array(JournalSummarySchema),
  },
  'journal:get': { request: z.object({ id: JournalId }), response: JournalDetailSchema },
  'journal:create': {
    request: z.strictObject({ template: JournalTemplateIdSchema }).optional(),
    response: JournalDetailSchema,
  },
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
  'journal:setStatus': {
    request: z.object({ id: JournalId, status: z.enum(['draft', 'completed', 'archived']) }),
    response: JournalSummarySchema,
  },
  'journal:setQvSelected': {
    request: z.strictObject({ id: JournalId, selected: z.boolean() }),
    response: JournalSummarySchema,
  },
  'journal:duplicate': { request: z.object({ id: JournalId }), response: JournalDetailSchema },
  'journal:delete': { request: z.object({ id: JournalId }), response: z.object({ deleted: z.boolean() }) },

  // --- Kategorien und Schlagwörter (AJ-09) ---
  // Jede Änderung liefert die vollständige, aktuelle Liste zurück (klein, und
  // die Oberfläche muss nichts selbst nachrechnen).
  'taxonomy:list': { request: z.undefined(), response: TaxonomySchema },
  'category:create': { request: z.object({ name: CategoryName }), response: TaxonomySchema },
  // Fehlende Vorschlag-Kategorien a–g ergänzen (R-05)
  'category:addSuggestions': { request: z.undefined(), response: TaxonomySchema },
  // Namen je nach Art unterschiedlich geprüft (Schlagwort: kürzer, ohne Komma)
  'taxonomy:rename': {
    request: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('category'), id: TaxonomyId, name: CategoryName }),
      z.object({ kind: z.literal('tag'), id: TaxonomyId, name: TagName }),
    ]),
    response: TaxonomySchema,
  },
  'taxonomy:merge': {
    request: z.object({ kind: z.enum(TAXONOMY_KINDS), sourceId: TaxonomyId, targetId: TaxonomyId }),
    response: TaxonomySchema,
  },
  'taxonomy:delete': {
    request: z.object({ kind: z.enum(TAXONOMY_KINDS), id: TaxonomyId }),
    response: TaxonomySchema,
  },
  'journal:setCategories': {
    request: z.object({ id: JournalId, categoryIds: z.array(TaxonomyId).max(200) }),
    response: z.object({ journal: JournalSummarySchema, taxonomy: TaxonomySchema }),
  },
  // Schlagwörter als Namen: bestehende werden wiederverwendet, neue angelegt
  'journal:setTags': {
    request: z.object({ id: JournalId, names: z.array(TagName).max(100) }),
    response: z.object({ journal: JournalSummarySchema, taxonomy: TaxonomySchema }),
  },

  // --- Journal-Verknüpfungen (AJ-10) ---
  // Verknüpfungen in beiden Richtungen + Rückverweise aus dem Text
  'journal:links': { request: z.object({ id: JournalId }), response: JournalLinksSchema },
  // Verknüpfen/Lösen liefern die neue Liste und die Zusammenfassung des
  // Journals (Zeitpunkt «zuletzt geändert» für Start und Liste)
  'journal:link': {
    request: z.object({ id: JournalId, otherId: JournalId }),
    response: z.object({ journal: JournalSummarySchema, links: JournalLinksSchema }),
  },
  'journal:unlink': {
    request: z.object({ id: JournalId, otherId: JournalId }),
    response: z.object({ journal: JournalSummarySchema, links: JournalLinksSchema }),
  },

  // --- Fachbuch-Suche (AJ-11) ---
  // Volltextsuche über Titel, Text, Bildlegenden, Schlagwörter und Kategorien.
  // Die Eingabe ist freier Text; der Hauptprozess baut daraus selbst eine
  // sichere FTS5-Abfrage (keine Abfragesprache vom Renderer).
  'search:query': { request: SearchRequestSchema, response: SearchResultSchema },
  // «Suchindex neu aufbauen»: liefert die Anzahl neu indexierter Journale
  'search:rebuild': { request: z.undefined(), response: z.object({ journals: z.number().int() }) },

  // Lokale MCP-Freigabe und Prüfung. Der MCP-Client hat keinen IPC-Zugriff.
  'mcp:status': { request: z.undefined(), response: McpStatusSchema },
  'mcp:setActive': { request: z.strictObject({ enabled: z.boolean() }), response: McpStatusSchema },
  'mcp:setDrafts': { request: z.strictObject({ allowed: z.boolean() }), response: McpStatusSchema },
  'mcp:copy': { request: z.strictObject({ field: z.enum(['endpoint', 'token']) }), response: z.boolean() },
  'mcp:decide': { request: McpDecisionSchema, response: McpDecisionResultSchema },

  // --- Word-Export (AJ-12) ---
  // Ein Journal als Word-Dokument. Der Hauptprozess zeigt selbst den
  // Speichern-Dialog; der Renderer schickt nur die Journal-ID und bestätigt,
  // dass der Exporthinweis (R-10) angezeigt und angenommen wurde.
  'export:journalDocx': {
    request: z.object({ id: JournalId, noticeAccepted: z.literal(true) }),
    response: ExportResultSchema,
  },
  'export:journalPdf': {
    request: z.object({ id: JournalId, noticeAccepted: z.literal(true) }),
    response: ExportResultSchema,
  },
  // Mehrere Journale als ein Word-Dokument (AJ-13) mit Titelseite,
  // Inhaltsverzeichnis und je einem Seitenumbruch vor jedem Journal. Die
  // Reihenfolge der IDs ist die Reihenfolge im Dokument. Geprüft: 1 bis
  // COLLECTION_LIMITS.maxJournals gültige IDs ohne Doppelte, Titel begrenzt.
  // Wie beim Einzel-DOCX bestimmt nur der Speichern-Dialog den Zielpfad.
  'export:collectionDocx': {
    request: CollectionExportRequest,
    response: ExportResultSchema,
  },
  'export:collectionPdf': {
    request: CollectionExportRequest,
    response: ExportResultSchema,
  },
  // Zuletzt exportierte Datei im Explorer zeigen (kein Pfad vom Renderer)
  'export:showFile': { request: z.undefined(), response: z.object({ shown: z.boolean() }) },

  // --- Projektübergabe .ajournal (AJ-14) ---
  // Keiner dieser Befehle nimmt einen Pfad an: Datei und Ordner wählt der
  // Nutzer in den nativen Dialogen des Hauptprozesses, der sie sich bis zum
  // nächsten Schritt merkt. Fortschritt kommt als Ereignis (archive.onProgress).
  // Ganzes Projekt als .ajournal speichern (Speichern-Dialog im Hauptprozess)
  'archive:export': { request: z.undefined(), response: ArchiveExportResultSchema },
  // Zuletzt gespeicherte .ajournal-Datei im Explorer zeigen
  'archive:showFile': { request: z.undefined(), response: z.object({ shown: z.boolean() }) },
  // Import Schritt 1: Datei wählen und prüfen → Vorschau + vorgeschlagener Zielordner
  'archive:chooseImport': { request: z.undefined(), response: ArchivePreviewSchema },
  // Import optional: anderen Zielordner wählen (null = abgebrochen, alter bleibt)
  'archive:chooseImportTarget': {
    request: z.undefined(),
    response: z.object({ target: z.string().nullable() }),
  },
  // Import Schritt 2: entpacken, prüfen, als neues Projekt öffnen
  'archive:import': {
    request: z.undefined(),
    response: z.object({
      status: z.literal('imported'),
      project: ProjectInfoSchema,
      journals: z.number().int().nonnegative(),
      media: z.number().int().nonnegative(),
      warnings: z.array(z.string()),
    }),
  },

  // --- Sicherungen und Wiederherstellung (AJ-15) ---
  // Die Oberfläche kennt Sicherungen nur über ihre ID aus backup:list
  // (Muster BACKUP_ID_PATTERN); der Hauptprozess baut den Pfad selbst und
  // prüft, dass es die Sicherung gibt. Zielordner nur aus dem Dialog.
  'backup:list': { request: z.undefined(), response: BackupListSchema },
  // «Jetzt sichern» (unverändert seit der neuesten Sicherung → keine neue)
  'backup:create': { request: z.undefined(), response: BackupCreateResultSchema },
  // Sicherung vollständig prüfen und beschreiben; merkt sich den Vorschlag
  // für «als neues Lernjournal»
  'backup:preview': { request: z.object({ id: BackupId }), response: BackupPreviewSchema },
  // Anderen Ordner für «als neues Lernjournal» wählen (null = abgebrochen)
  'backup:chooseRestoreTarget': {
    request: z.object({ id: BackupId }),
    response: z.object({ target: z.string().nullable() }),
  },
  // Wiederherstellen und das Ergebnis öffnen. Fortschritt als Ereignis
  // (archive.onProgress, gleicher Kanal wie die Projektübergabe).
  'backup:restore': {
    request: z.object({ id: BackupId, mode: z.enum(RESTORE_MODES) }),
    response: z.object({
      status: z.literal('restored'),
      mode: z.enum(RESTORE_MODES),
      project: ProjectInfoSchema,
      journals: z.number().int().nonnegative(),
      media: z.number().int().nonnegative(),
      warnings: z.array(z.string()),
      // Beim Ersetzen: Sicherung mit dem Stand davor
      safetyBackup: BackupEntrySchema.nullable(),
    }),
  },
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
