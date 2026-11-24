// Schema Version 3 (AJ-15): Zeitpunkt der letzten Projektübergabe (.ajournal)
// und «Später erinnern» für die Erinnerung nach 30 Tagen (SPEC «Autosave,
// Backup und Sicherheit»).
//
// Warum in der Datenbank und nicht in den Benutzerdaten der App? Beides gehört
// zum Projekt, nicht zum Computer: Wird der Projektordner verschoben oder auf
// einem anderen Computer geöffnet, stimmt die Erinnerung weiterhin. Und eine
// Wiederherstellung kann den Wert bewusst übernehmen (backup-service.ts).
//
// ALTER TABLE … ADD COLUMN statt neuer Tabelle: Es gibt genau eine Projektzeile,
// bestehende Daten bleiben unangetastet (neue Spalten sind NULL = «noch nie»).
// SQLite schreibt die Spalten in den gespeicherten CREATE-TABLE-Text; der
// Schema-Vergleich beim Import (archive-db.ts) baut seine Referenz aus
// denselben Migrationen und sieht darum genau denselben Text.
//
// WICHTIG: Diese Datei nach Veröffentlichung nie mehr ändern (siehe schema-v1.ts).

export const SCHEMA_V3 = /* sql */ `
-- ISO-Zeitstempel in UTC; julianday() ist NULL bei ungültigem Text
ALTER TABLE project ADD COLUMN last_export_at TEXT
  CHECK (last_export_at IS NULL OR julianday(last_export_at) IS NOT NULL);
ALTER TABLE project ADD COLUMN export_reminder_snoozed_until TEXT
  CHECK (export_reminder_snoozed_until IS NULL OR julianday(export_reminder_snoozed_until) IS NOT NULL);
`;
