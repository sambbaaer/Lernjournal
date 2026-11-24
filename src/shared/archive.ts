// Projektübergabe «.ajournal» (AJ-14): gemeinsame Typen und Texte für
// Hauptprozess und Oberfläche. Das Format selbst (Einträge, Manifest,
// Grenzen) steht im Hauptprozess unter src/main/archive/archive-format.ts.
//
// Grundsätze (SPEC «Projektordner»):
//  - Eine .ajournal-Datei enthält das ganze Lernjournal: Datenbank und Bilder,
//    mit Prüfsummen. Sie dient dem Wechsel auf einen anderen Computer und als
//    Kopie ausserhalb des Computers (USB-Stick, NAS).
//  - Import legt IMMER ein neues Projekt in einem neuen oder leeren Ordner an
//    – nie wird ein bestehendes Projekt überschrieben oder zusammengeführt.
//  - Den Speicherort bestimmen ausschliesslich die nativen Dialoge im
//    Hauptprozess; die Oberfläche schickt nie Pfade.
import { z } from 'zod';

export const ARCHIVE_TEXTS = {
  exportTitle: 'Projekt übergeben (.ajournal)',
  exportIntro:
    'Speichert dein ganzes Lernjournal – alle Journale, Bilder, Kategorien, Schlagwörter und Verknüpfungen – in einer einzigen Datei. Damit ziehst du auf einen neuen Computer um oder bewahrst eine Kopie ausserhalb dieses Computers auf.',
  exportStorage:
    'Speichere die Datei auf einem USB-Stick, einer externen Festplatte oder einem NAS. Eine Kopie auf demselben Computer schützt nicht vor Geräteverlust oder Defekt.',
  exportPrivacy:
    'Die Datei enthält alles, auch Entwürfe und archivierte Journale. Gib sie nur an Personen weiter, die alles sehen dürfen.',
  importTitle: 'Projekt importieren (.ajournal)',
  importIntro:
    'Öffnet eine .ajournal-Datei als neues Lernjournal, z. B. nach dem Umzug auf einen neuen Computer. Die Datei wird vollständig geprüft; ein bestehendes Lernjournal wird nie überschrieben.',
} as const;

// Fortschritt einer laufenden Übergabe (Hauptprozess → Oberfläche):
// Schritt als Text, Anteil 0–100 (null = unbestimmt)
export const ArchiveProgressSchema = z.object({
  step: z.string().max(200),
  percent: z.number().min(0).max(100).nullable(),
});
export type ArchiveProgress = z.infer<typeof ArchiveProgressSchema>;

// Ergebnis «Projekt übergeben»
export const ArchiveExportResultSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('saved'),
    fileName: z.string(),
    bytes: z.number().int().nonnegative(),
    journals: z.number().int().nonnegative(),
    media: z.number().int().nonnegative(),
    warnings: z.array(z.string()),
  }),
  z.object({ status: z.literal('canceled') }),
]);
export type ArchiveExportResult = z.infer<typeof ArchiveExportResultSchema>;

// Vorschau einer .ajournal-Datei vor dem Import (aus dem Manifest)
export const ArchiveSummarySchema = z.object({
  title: z.string(),
  journals: z.number().int().nonnegative(),
  media: z.number().int().nonnegative(),
  createdAt: z.string(),
  appVersion: z.string(),
  archiveBytes: z.number().int().nonnegative(),
  unpackedBytes: z.number().int().nonnegative(),
});
export type ArchiveSummary = z.infer<typeof ArchiveSummarySchema>;

// «Datei wählen»: abgebrochen oder geprüfte Vorschau samt vorgeschlagenem
// Zielordner (nur zur Anzeige – der Hauptprozess merkt sich den Pfad selbst)
export const ArchivePreviewSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('canceled') }),
  z.object({
    status: z.literal('ready'),
    fileName: z.string(),
    summary: ArchiveSummarySchema,
    target: z.string(),
  }),
]);
export type ArchivePreview = z.infer<typeof ArchivePreviewSchema>;
