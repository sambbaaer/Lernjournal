# ADR 0006 – Sicherungen im Projektordner: ZIP je Stand, gemeinsamer Bildvorrat

- **Status:** angenommen (AJ-15, 2026-11-24)

## Kontext
SPEC «Autosave, Backup und Sicherheit»: mindestens täglich nach Änderungen und bei Programmende ein konsistentes DB-Backup über die SQLite-Backup-API, Rotation «letzte 10 + je ein Monatsstand», Medien konsistent berücksichtigen (unveränderlich, per Hash prüfbar), Restore mit Vorschau/Bestätigung, vorzugsweise in ein neues Zielprojekt, Erinnerung, wenn seit 30 Tagen kein `.ajournal`-Export erfolgt ist. Ablage im Projektordner unter `backups/`. Vor Migrationen gab es seit AJ-04 eine rohe Datenbankkopie `vor-update-format-N-….sqlite`, die die Oberfläche nicht kannte.

## Entscheid
**Ablage**
```
backups/
  sicherung-2026-11-24T08-30-00-000Z.zip    ein Stand
      journal.sqlite   Backup-API, Suchindex geleert, VACUUM, Journalmodus DELETE
      manifest.json    format «lernjournal-sicherung», formatVersion, appVersion,
                       schemaVersion, createdAt, reason, project, counts,
                       recentTitles (5), fingerprint, database {size, sha256},
                       media [{path, sha256}], missingMedia
  media/<uuid>.<ext>                          Bildvorrat für alle Stände
```
- **Ein ZIP je Stand, Bilder einmal im Vorrat.** Bilder sind unveränderlich (neues Bild = neue UUID, Legende in der DB) und per SHA-256 prüfbar. Vollständige Kopien in jedem Stand wären bei 10 + bis zu 48 Monatsständen ein Vielfaches aller Bilder. In den Vorrat kommen nur Bilder, deren Inhalt zur gespeicherten Prüfsumme passt; vorhandene Dateien werden nie überschrieben. Die Rotation entfernt Bilder, auf die kein verbleibender Stand mehr verweist – aber nur, wenn alle verbleibenden Manifeste lesbar sind.
- **ZIP über den misstrauischen Leser/Schreiber aus ADR 0005**, eigene Kennung, damit eine Sicherung nie als `.ajournal` gilt. Der Suchindex ist abgeleitet (ADR 0004) und wird bei der Wiederherstellung neu aufgebaut – geleert macht er jeden Stand deutlich kleiner.
- **ID = UTC-Zeitstempel im Dateinamen** (bei Gleichstand mit Zähler); alphabetisch = chronologisch. Die Oberfläche kennt nur IDs (Muster im IPC-Vertrag, Existenz im Dienst), nie Pfade.

**Konsistente Kopie (gilt auch für den `.ajournal`-Export):** Backup-API aus einer **eigenen, nur lesenden Verbindung in einem Schritt**. Aus der Verbindung des Programms bricht SQLite einen Kopierschritt mit `SQLITE_LOCKED` ab, sobald dieselbe Verbindung währenddessen schreibt (Speichern während einer Sicherung im Hintergrund; im Test nachgestellt, rund 30 % Fehlschläge bei Dauerschreiben). Die eigene Verbindung liest im WAL-Modus einen festen Stand mit nur bestätigten Transaktionen, ohne das Speichern zu blockieren; ein einziger Schritt hält diesen Stand über die ganze Kopie fest. «Ein Schritt» heisst `rate` = 2³¹−1, weil Node 24 in Electron −1 ablehnt.

**Zeitpunkte** (`BACKUP_POLICY` in `src/shared/backup.ts`, eine Stelle für Texte und Logik): beim Öffnen im Hintergrund, wenn der **Fingerabdruck** (SHA-256 über alle Datentabellen ohne Suchindex) von der neuesten Sicherung abweicht – fängt auch Sitzungen auf, die abgestürzt sind; beim Schliessen (Projektwechsel, «Projekt schliessen», Programmende mit höchstens 60 s Wartezeit) und täglich (Prüfung alle 15 min, neueste Sicherung ≥ 24 h alt), wenn in der Sitzung geschrieben wurde (`total_changes()`); von Hand «Jetzt sichern». Ohne echte Änderung entsteht keine neue Sicherung, damit die Rotation keine verschiedenen Stände verdrängt. Alle Vorgänge laufen nacheinander (`BackupService.exclusive`).

**Rotation** (`rotation.ts`, rein): die neuesten 10 + je Kalendermonat (Ortszeit) die neueste, für 48 Monate; die eben erstellte und eine gerade wiederhergestellte Sicherung sind geschützt (verstellte Uhr: eine neue Sicherung mit altem Datum fiele sonst sofort weg).

**Wiederherstellung** mit Vorschau nach vollständiger Prüfung (Prüfsumme der DB, für jedes Bild eine unversehrte Quelle: Vorrat, sonst Bilderordner des Projekts), Inhalt im Vergleich zu jetzt und den zuletzt bearbeiteten Journalen:
- **als neues Lernjournal (empfohlen, SPEC)** in einen neuen/leeren Ordner (Vorschlag `Dokumente\<Titel> (Stand JJJJ-MM-TT)`), bei Fehler aufgeräumt;
- **aktuelles ersetzen:** zuerst Sicherheitskopie des aktuellen Stands (schlägt sie fehl → Abbruch), Datenbank in `backups/.wiederherstellung-…` vorbereiten, fehlende Bilder in `media/`, Projekt schliessen, Datei atomar ersetzen, wieder öffnen; lässt sie sich nicht öffnen, kommt die bisherige Datei zurück. Zeitpunkt der letzten Übergabe und «Später erinnern» werden vom aktuellen Projekt übernommen.
Die Datenbank durchläuft dieselben Prüfungen wie beim Import (`verifyImportedDatabase`, `finishImportedDatabase`: exaktes Schema, integrity_check, Inhalte, Migration, Suchindex neu).

**Vor Migrationen** entsteht jetzt eine gewöhnliche Sicherung mit Anlass «vor-update» (`backupBeforeMigration`); sie erscheint in der Liste und wird beim Wiederherstellen migriert. Bestehende alte Einzeldateien bleiben unangetastet.

**Erinnerung an die Projektübergabe:** Schema v3 speichert `project.last_export_at` und `export_reminder_snoozed_until` in der Projektdatenbank (gehört zum Projekt, nicht zum Computer; wandert beim Verschieben mit). Gesetzt nach jeder geprüften `.ajournal`-Übergabe und beim Import (die Datei ist dann eine aktuelle Kopie). Fälligkeit als reine Funktion `exportReminder()` (`EXPORT_REMINDER`: 30 Tage, «Später erinnern» 7 Tage, 1 Tag Toleranz): ab genau 30 × 24 h, nie übergeben → ab Projekterstellung, ohne Journale nie; Zeitpunkte mehr als einen Tag in der Zukunft (Uhr verstellt) gelten nicht.

## Verworfen
- **Vollständiges `.ajournal` je Sicherung:** einfach, aber Bilder × Anzahl Stände.
- **Hardlinks auf die Projektbilder:** spart Platz, aber eine beschädigte Projektdatei wäre dann auch in der Sicherung beschädigt; auf FAT32/exFAT (USB) nicht verfügbar.
- **Ordner je Stand statt ZIP:** weniger Code, aber unkomprimierte Datenbanken × bis zu 58 Stände und kein Prüfsummen-Rahmen aus ADR 0005.
- **Schreiben während der Sicherung anhalten (Mutex vor jedem Speichern):** greift in jeden Dienst ein und verzögert Autosave; die eigene Leseverbindung löst es an einer Stelle.
- **Datum der letzten Übergabe in den Benutzerdaten der App:** ginge beim Umzug des Projektordners verloren und wäre je Computer verschieden.

## Konsequenzen
- **+** Vollständige Wiederherstellung inklusive Bilder, auch wenn ein Journal samt Bildern inzwischen gelöscht wurde; Platzbedarf ≈ Bilder einmal + kleine ZIPs.
- **+** Eine Sicherung ist mit Bordmitteln lesbar (ZIP mit `journal.sqlite`): Ist die Projektdatei so beschädigt, dass sich das Projekt nicht mehr öffnen lässt, hilft von Hand: `journal.sqlite` aus der neuesten Sicherung an die Stelle der beschädigten Datei legen (Bilder liegen in `media/` bzw. `backups/media/`; der Suchindex wird beim Öffnen neu aufgebaut).
- **−** Wiederherstellen aus einem Projekt, das sich nicht öffnen lässt, gibt es in der Oberfläche noch nicht (siehe oben, von Hand).
- **−** Fingerabdruck und VACUUM laufen synchron im Hauptprozess (bei einigen MB Datenbank unter einer Sekunde).
- Neue Tabelle (Migration)? Nichts zu tun: Fingerabdruck und Schema-Prüfung lesen `sqlite_master`. Neue Dateiart im Projekt? `BackupManifestSchema` erweitern, `BACKUP_FORMAT_VERSION` erhöhen.
