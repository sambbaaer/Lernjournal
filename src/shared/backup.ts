// Sicherungen und Wiederherstellung (AJ-15): gemeinsame Typen, Regeln und
// Texte für Hauptprozess und Oberfläche. Ablage, Format und Ablauf stehen im
// Hauptprozess unter src/main/backup/ (ADR 0006).
//
// Grundsätze (SPEC «Autosave, Backup und Sicherheit»):
//  - Lernjournal sichert das geöffnete Projekt selbst: beim Öffnen, beim
//    Schliessen und mindestens täglich – jeweils nur, wenn sich seit der
//    letzten Sicherung etwas geändert hat – plus auf Knopfdruck.
//  - Sicherungen liegen im Projektordner (Ordner «backups»). Sie schützen vor
//    Bedienfehlern und beschädigten Dateien, NICHT vor Geräteverlust. Dafür
//    gibt es die Projektübergabe .ajournal und die Erinnerung nach 30 Tagen.
//  - Die Oberfläche schickt nie Pfade, nur IDs aus der Liste, die der
//    Hauptprozess geliefert hat.
import { z } from 'zod';

const DAY_MS = 24 * 60 * 60 * 1000;

// Aufbewahrung und Zeitpunkte – an EINER Stelle, damit Oberfläche (Texte)
// und Hauptprozess (Rotation, Zeitplan) dieselben Zahlen verwenden.
// Eigene Produktentscheide (SPEC), keine Zahlen aus offiziellen Vorgaben.
export const BACKUP_POLICY = {
  // Die neuesten Sicherungen, die immer bleiben (SPEC: «letzte 10»)
  keepLatest: 10,
  // Zusätzlich je Kalendermonat die neueste Sicherung («je ein Monatsstand»),
  // für so viele Monate rückwärts. 48 = vier Lehrjahre.
  keepMonths: 48,
  // «Mindestens täglich nach Änderungen»: Während das Programm läuft, wird
  // gesichert, sobald die neueste Sicherung so alt ist und sich seither etwas
  // geändert hat.
  intervalMs: DAY_MS,
  // So oft prüft das laufende Programm, ob die tägliche Sicherung fällig ist
  checkEveryMs: 15 * 60 * 1000,
  // Höchstens so lange wartet das Beenden des Programms auf die letzte
  // Sicherung (hängender Netzlaufwerk-Ordner). Danach wird ohne beendet –
  // eine abgebrochene Sicherung hinterlässt keine halbe Datei.
  quitTimeoutMs: 60 * 1000,
} as const;

// Erinnerung an eine Kopie ausserhalb des Computers (.ajournal-Export)
export const EXPORT_REMINDER = {
  // SPEC: «wenn seit 30 Tagen kein .ajournal-Export erfolgt ist»
  afterDays: 30,
  // «Später erinnern» blendet den Hinweis so viele Tage aus
  snoozeDays: 7,
  // Liegt ein gespeicherter Zeitpunkt mehr als so weit in der Zukunft, war
  // die Uhr verstellt – dann gilt er nicht (siehe exportReminder)
  clockToleranceMs: DAY_MS,
} as const;

// --- Sicherungen ------------------------------------------------------------

// Anlass einer Sicherung (steht im Manifest, wird in der Liste angezeigt)
export const BACKUP_REASONS = [
  'oeffnen',
  'schliessen',
  'taeglich',
  'manuell',
  'vor-update',
  'vor-wiederherstellung',
] as const;
export type BackupReason = (typeof BACKUP_REASONS)[number];

export const BACKUP_REASON_LABELS: Record<BackupReason, string> = {
  oeffnen: 'Beim Öffnen',
  schliessen: 'Beim Schliessen',
  taeglich: 'Täglich',
  manuell: 'Von Hand',
  'vor-update': 'Vor dem Umwandeln auf ein neues Datenformat',
  'vor-wiederherstellung': 'Vor einer Wiederherstellung',
};

// ID = Dateiname ohne Endung: «sicherung-2026-11-24T08-30-00-000Z», bei
// Gleichstand mit Zähler «…Z-2». Der Hauptprozess akzeptiert nur IDs, die
// genau so aussehen UND in seiner aktuellen Liste stehen – nie einen Pfad.
export const BACKUP_ID_PATTERN = /^sicherung-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z(?:-\d{1,3})?$/;
export const BackupId = z.string().max(60).regex(BACKUP_ID_PATTERN);

export const BackupEntrySchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  reason: z.enum(BACKUP_REASONS).nullable(), // null = Sicherung nicht lesbar
  journals: z.number().int().nonnegative().nullable(),
  media: z.number().int().nonnegative().nullable(),
  bytes: z.number().int().nonnegative(),
  // Manifest nicht lesbar: wird angezeigt, kann aber nicht wiederhergestellt werden
  damaged: z.boolean(),
});
export type BackupEntry = z.infer<typeof BackupEntrySchema>;

export const BackupListSchema = z.object({
  backups: z.array(BackupEntrySchema), // neueste zuerst
  // Letzte automatische Sicherung fehlgeschlagen? (verständliche Meldung)
  lastError: z.string().nullable(),
});
export type BackupList = z.infer<typeof BackupListSchema>;

export const BackupCreateResultSchema = z.object({
  // 'unchanged': Seit der neuesten Sicherung hat sich nichts geändert – sie ist aktuell
  status: z.enum(['created', 'unchanged']),
  backup: BackupEntrySchema,
});
export type BackupCreateResult = z.infer<typeof BackupCreateResultSchema>;

// Vorschau vor der Wiederherstellung: Die Sicherung ist dabei vollständig
// geprüft worden (Prüfsummen von Datenbank und Bildern).
export const BackupPreviewSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  reason: z.enum(BACKUP_REASONS),
  journals: z.number().int().nonnegative(),
  media: z.number().int().nonnegative(),
  // Zuletzt bearbeitete Journale in der Sicherung (Titel, neueste zuerst)
  recentTitles: z.array(z.string()),
  appVersion: z.string(),
  // Bilder, die weder im Sicherungsordner noch im Projekt unversehrt vorliegen
  missingMedia: z.number().int().nonnegative(),
  // Zum Vergleich: der aktuelle Stand
  current: z.object({ journals: z.number().int().nonnegative(), media: z.number().int().nonnegative() }),
  // Vorgeschlagener Ordner für «als neues Lernjournal» (nur zur Anzeige)
  target: z.string(),
});
export type BackupPreview = z.infer<typeof BackupPreviewSchema>;

// 'new': als neues Lernjournal in einem neuen Ordner (SPEC: bevorzugt);
// 'replace': aktuelles Lernjournal ersetzen – vorher wird der aktuelle Stand gesichert
export const RESTORE_MODES = ['new', 'replace'] as const;
export type RestoreMode = (typeof RESTORE_MODES)[number];

// --- Texte ------------------------------------------------------------------

export const BACKUP_TEXTS = {
  sectionTitle: 'Sicherungen',
  intro:
    'Lernjournal sichert dein Projekt automatisch beim Öffnen, beim Schliessen und mindestens einmal täglich, wenn sich etwas geändert hat. Die Sicherungen liegen im Projektordner (Ordner «backups»).',
  retention: `Aufbewahrt werden die letzten ${BACKUP_POLICY.keepLatest} Sicherungen und zusätzlich je eine pro Monat.`,
  notExternal:
    'Sicherungen auf diesem Computer helfen bei Bedienfehlern oder einer beschädigten Datei – nicht, wenn das Gerät verloren geht oder kaputt ist. Dafür gibt es «Projekt übergeben» (.ajournal) auf einen USB-Stick oder ein NAS.',
  restoreTitle: 'Sicherung wiederherstellen',
  modeNew: 'Als neues Lernjournal wiederherstellen (empfohlen)',
  modeNewHint:
    'Das aktuelle Lernjournal bleibt unverändert. Die Sicherung wird in einem neuen Ordner geöffnet – du kannst danach in Ruhe vergleichen.',
  modeReplace: 'Aktuelles Lernjournal durch diese Sicherung ersetzen',
  modeReplaceHint:
    'Vorher wird der aktuelle Stand gesichert. Du kannst ihn danach jederzeit wieder herstellen.',
  damaged:
    'Diese Sicherung ist beschädigt und kann nicht wiederhergestellt werden. Wähle eine andere Sicherung.',
} as const;

// --- Erinnerung an die Projektübergabe ----------------------------------------

export type ExportReminderInput = {
  lastExportAt: string | null; // letzte .ajournal-Übergabe (ISO, UTC)
  snoozedUntil: string | null; // «Später erinnern» bis (ISO, UTC)
  projectCreatedAt: string;
  journalCount: number;
  now: Date;
};

export type ExportReminder =
  | { due: false }
  // 'never': noch nie übergeben; 'overdue': letzte Übergabe zu alt;
  // 'clock': gespeicherter Zeitpunkt liegt in der Zukunft (Uhr war verstellt)
  | { due: true; kind: 'never' | 'overdue' | 'clock'; days: number | null };

const time = (iso: string | null): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
};

// Ist die Erinnerung «Projekt übergeben» fällig? Reine Funktion (Vitest).
//
//  - Ohne Journale gibt es nichts zu sichern → keine Erinnerung.
//  - Noch nie übergeben: gezählt ab Erstellung des Projekts (ein neues
//    Lernjournal wird nicht am ersten Tag gemahnt).
//  - Fällig ab GENAU afterDays × 24 h (in Millisekunden; Sommerzeit egal).
//  - Uhr verstellt: Liegt die letzte Übergabe mehr als clockToleranceMs in
//    der Zukunft, wäre sie sonst womöglich jahrelang «frisch» – darum gilt
//    sie dann als unbekannt und die Erinnerung erscheint. Eine neue Übergabe
//    speichert die richtige Zeit, damit heilt sich das von selbst.
//  - «Später erinnern» wirkt nur bis zum gespeicherten Zeitpunkt und nur,
//    wenn dieser plausibel ist (höchstens snoozeDays in der Zukunft).
export function exportReminder(input: ExportReminderInput): ExportReminder {
  if (input.journalCount <= 0) return { due: false };
  const now = input.now.getTime();
  const tol = EXPORT_REMINDER.clockToleranceMs;

  const snooze = time(input.snoozedUntil);
  if (snooze !== null && now < snooze && snooze - now <= EXPORT_REMINDER.snoozeDays * DAY_MS + tol)
    return { due: false };

  const last = time(input.lastExportAt);
  const base = last ?? time(input.projectCreatedAt);
  if (base === null || base > now + tol)
    return { due: true, kind: last === null && base === null ? 'never' : 'clock', days: null };
  const age = now - base;
  if (age < EXPORT_REMINDER.afterDays * DAY_MS) return { due: false };
  return { due: true, kind: last === null ? 'never' : 'overdue', days: Math.floor(age / DAY_MS) };
}

// Text der Infoleiste
export function exportReminderText(r: Extract<ExportReminder, { due: true }>): string {
  const lead =
    r.kind === 'never'
      ? 'Von diesem Lernjournal gibt es noch keine Kopie ausserhalb des Computers.'
      : r.kind === 'overdue'
        ? `Deine letzte Kopie ausserhalb des Computers (.ajournal) ist ${r.days} Tage alt.`
        : 'Das Datum deiner letzten Kopie ausserhalb des Computers (.ajournal) ist unklar.';
  return `${lead} Speichere das Projekt auf einem USB-Stick oder NAS – Sicherungen auf diesem Computer helfen nicht, wenn das Gerät verloren geht oder kaputt ist.`;
}

// --- Erinnerung an ein neues Journal (Opt-in, konfigurierbar) -----------------

export const JOURNAL_REMINDER = {
  // Standard-Intervall (30 Tage = ca. 1× pro Monat)
  defaultDays: 30,
  minDays: 1,
  maxDays: 365,
  // «Nicht jetzt» schiebt die Erinnerung um 7 Tage auf
  snoozeDays: 7,
  clockToleranceMs: DAY_MS,
} as const;

export type JournalReminderInput = {
  enabled: boolean;
  intervalDays: number;
  // Letztes Journal: neuestes Arbeits- oder Erstelldatum bzw. Projekterstellung
  lastJournalAt: string | null;
  projectCreatedAt: string;
  snoozedUntil: string | null;
  now: Date;
};

export type JournalReminder = { due: false } | { due: true; kind: 'first' | 'overdue'; days: number };

// Ist die smarte Erinnerung für ein neues Journal fällig? Reine Funktion (Vitest).
//  - Nur wenn Opt-in aktiv (`enabled: true`).
//  - «Nicht jetzt» (`snoozedUntil`) pausiert die Erinnerung bis zum Zeitpunkt.
//  - Ohne Journale zählt das Alter ab Projekterstellung (`first`), sonst ab dem
//    zuletzt erstellten/bearbeiteten Journal (`overdue`).
export function journalReminder(input: JournalReminderInput): JournalReminder {
  if (!input.enabled) return { due: false };
  const daysLimit = Math.max(
    JOURNAL_REMINDER.minDays,
    Math.min(JOURNAL_REMINDER.maxDays, Math.trunc(input.intervalDays) || JOURNAL_REMINDER.defaultDays),
  );
  const now = input.now.getTime();
  const tol = JOURNAL_REMINDER.clockToleranceMs;

  const snooze = time(input.snoozedUntil);
  if (snooze !== null && now < snooze && snooze - now <= JOURNAL_REMINDER.snoozeDays * DAY_MS + tol) {
    return { due: false };
  }

  const last = time(input.lastJournalAt);
  const base = last ?? time(input.projectCreatedAt);
  if (base === null || base > now + tol) return { due: false };

  const age = now - base;
  if (age < daysLimit * DAY_MS) return { due: false };
  return {
    due: true,
    kind: last === null ? 'first' : 'overdue',
    days: Math.floor(age / DAY_MS),
  };
}

export function journalReminderText(r: Extract<JournalReminder, { due: true }>): string {
  return r.kind === 'first'
    ? `Dein Lernjournal wurde vor ${r.days} Tagen eingerichtet. Halte deinen ersten Auftrag in einem kurzen Journal fest.`
    : `Dein letztes Journal liegt ${r.days} Tage zurück. Halte zeitnah einen aktuellen Auftrag fest, solange die Details noch präsent sind.`;
}
