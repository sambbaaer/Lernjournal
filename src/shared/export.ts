// Word-Export (AJ-12 Einzel-DOCX, AJ-13 Sammel-DOCX): gemeinsame Typen und
// Texte für Hauptprozess und Oberfläche.
//
// Grundsätze (SPEC «Word-Export», QUELLEN R-10):
//  - Word ist ein Einweg-Export. Was in Word geändert wird, fliesst NICHT
//    zurück in Lernjournal – das sagt die Oberfläche bei jedem Export.
//  - Vor JEDEM Export erscheint der Hinweis zu Geschäftsgeheimnissen,
//    Kundendaten und Personen auf Bildern (R-10). Er wird pro Export einmal
//    bestätigt, es gibt bewusst kein «nicht mehr anzeigen».
import { z } from 'zod';

// Hinweis vor jedem Export (R-10). Als Daten statt fest im Dialog, damit der
// Sammel-Export (AJ-13) und später PDF/QV-Mappe denselben Wortlaut zeigen.
export const EXPORT_NOTICE = {
  title: 'Vor dem Weitergeben prüfen',
  intro:
    'Exportierte Dateien werden oft weitergegeben – an deine Berufsbildnerin oder deinen Berufsbildner, an die Schule oder für das Qualifikationsverfahren. Prüfe darum vorher:',
  points: [
    {
      label: 'Geschäftsgeheimnisse',
      text: 'Interne Abläufe, Preise, Maschinendaten oder Rezepturen nur, wenn dein Lehrbetrieb einverstanden ist.',
    },
    {
      label: 'Kundendaten',
      text: 'Namen, Adressen, Logos und Druckdaten von Kundinnen und Kunden weglassen oder unkenntlich machen.',
    },
    {
      label: 'Personen auf Bildern',
      text: 'Fotos, auf denen Mitarbeitende oder andere Personen erkennbar sind, nur mit deren Einverständnis.',
    },
  ],
  oneWay: 'Die Word-Datei ist eine Kopie: Änderungen darin fliessen nicht in Lernjournal zurück.',
  confirm: 'Verstanden, weiter',
} as const;

// --- Sammel-DOCX (AJ-13) ----------------------------------------------------

// Titel der Titelseite, wenn nichts eingegeben wurde. «Lerndokumentation» ist
// der Begriff der BiVo (Art. 12) für die Journale – bewusst nicht «QV-Mappe»
// o. Ä.: Die QV-Mappe ist ein eigenes, späteres Ticket (P1).
export const DEFAULT_COLLECTION_TITLE = 'Lerndokumentation';

// Technische Grenzen des Sammel-Exports (keine Zahlen aus offiziellen
// Vorgaben): schützen den Hauptprozess vor unsinnig grossen Anfragen. Ein
// Projekt über vier Lehrjahre hat typischerweise einige Dutzend Journale.
export const COLLECTION_LIMITS = { maxJournals: 500, maxTitleLength: 150 } as const;

export type ExportFormat = 'docx' | 'pdf';
export const DEFAULT_QV_MINIMUM = 12; // QUELLEN 2.3 / R-08

// Hinweis zum Inhaltsverzeichnis. Die Seitenzahlen kennt erst Word (es
// berechnet den Umbruch); Lernjournal schreibt das Verzeichnis als Feld mit
// den Titeln vor, Word füllt die Seitenzahlen beim Aktualisieren ein.
export const COLLECTION_TOC_HINT =
  'Beim Öffnen fragt Word, ob die Felder des Dokuments aktualisiert werden sollen. Mit «Ja» erhält das Inhaltsverzeichnis seine Seitenzahlen. Später geht das jederzeit mit Rechtsklick ins Verzeichnis → «Felder aktualisieren».';

// Ergebnis eines Exports. «canceled» = Speichern-Dialog abgebrochen (kein Fehler).
// warnings: verständliche Hinweise, wenn etwas nicht wie im Editor übernommen
// werden konnte (z. B. ein fehlendes Bild) – die Datei ist trotzdem gültig.
export const ExportResultSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('saved'),
    fileName: z.string(),
    bytes: z.number().int().nonnegative(),
    warnings: z.array(z.string()),
  }),
  z.object({ status: z.literal('canceled') }),
]);
export type ExportResult = z.infer<typeof ExportResultSchema>;

// Dateigrösse für Menschen: «850 Bytes», «48 KB», «2,4 MB» (Schweizer Schreibweise
// mit Komma). Auch für den späteren PDF-Export (R-08: Dateigrösse anzeigen).
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Bytes`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1).replace('.', ',')} MB`;
}
