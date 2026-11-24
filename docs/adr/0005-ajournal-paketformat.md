# ADR 0005 – Paketformat «.ajournal» und eigenes ZIP auf `node:zlib`

- **Status:** angenommen (AJ-14, 2026-11-24)

## Kontext
SPEC verlangt eine portable, versionierte Projektdatei `.ajournal`: ZIP mit `manifest.json` (Formatversion, App-Version, Schemaversion, Exportdatum, SHA-256 je Datei), konsistenter DB-Sicherung und allen Medien; Import nur in ein neues Projekt; Schutz vor ZIP-Slip, Pfad-Traversal und Zip-Bomben (Gesamtgrösse, Kompressionsrate, Dateianzahl), Grössenlimiten und erlaubte Dateitypen; ältere Formate werden migriert, neuere verständlich abgelehnt. Die Datei kommt beim Import von aussen (USB-Stick, E-Mail, anderer PC) und ist damit nicht vertrauenswürdig.

## Entscheid
**Format (Formatversion 1)** – ein gewöhnliches ZIP, das jedes Programm öffnen kann, mit genau diesen Einträgen:

| Eintrag | Inhalt | Methode |
|---|---|---|
| `journal.sqlite` | Kopie per SQLite-Backup-API, danach `VACUUM`, Journalmodus DELETE (vollständig ohne `-wal`/`-shm`) | Deflate |
| `media/<uuid>.<png\|jpg\|webp>` | Bilder unverändert | gespeichert (schon komprimiert) |
| `manifest.json` | `format: "lernjournal-projekt"`, `formatVersion`, `appVersion`, `schemaVersion`, `createdAt`, `project {id, title}`, `counts {journals, media}`, `files [{path, size, sha256}]` | Deflate |

Das Manifest steht am Ende, weil die Prüfsummen beim Schreiben in einem Durchgang entstehen; gefunden wird es über das zentrale Verzeichnis. Paketformat und Datenbankschema sind getrennt versioniert: Neuere `formatVersion` oder `schemaVersion` → «Bitte Lernjournal aktualisieren»; ältere Schemas zieht der Import mit den vorhandenen Migrationen hoch (AJ-04); ältere Paketformate werden, sobald es sie gibt, in `readManifest()` umgewandelt.

**ZIP selbst geschrieben**, ohne Bibliothek, auf `node:zlib` (Deflate/Inflate als Stream, `crc32`) – rund 650 Zeilen mit Kommentaren in `src/main/archive/zip-reader.ts` und `zip-writer.ts`:
- **Leser misstraut allem:** Verzeichnisende muss bis zum Dateiende reichen, zentrales Verzeichnis lückenlos davor; jeder lokale Kopf muss zum Verzeichnis passen (Name, Methode, Grössen, CRC); keine Überlappungen (Trick der «besseren Zip-Bombe»). Namen: kein `..`, keine absoluten Pfade, keine Laufwerksbuchstaben, keine Backslashes, keine Doppelpunkte (NTFS-Datenströme), keine Steuerzeichen, keine reservierten Windows-Namen, kein Punkt/Leerzeichen am Ende, ohne UTF-8-Kennzeichen nur ASCII; keine Symlinks (Unix-Dateityp, Windows-Analysepunkt); keine Duplikate (auch nicht nach Gross/Klein und Unicode-NFC); danach nur die Namen des Formats. Abgelehnt: ZIP64, Verschlüsselung, mehrteilige Archive, andere Methoden als 0/8.
- **Grenzen an einer Stelle** (`ARCHIVE_LIMITS` in `archive-format.ts`): Archiv ≤ 3 GiB, entpackt gesamt ≤ 3 GiB, ≤ 20 000 Einträge, Verzeichnis ≤ 8 MiB, Manifest ≤ 4 MiB, Datenbank ≤ 1 GiB, Bild ≤ 15 MiB (wie beim Einfügen), Kompressionsverhältnis ≤ 200 : 1 ab 1 MiB. Technische Schutzgrenzen, keine Zahlen aus Vorgaben. Geprüft zuerst laut Verzeichnis und **beim Entpacken nochmals an den tatsächlich entpackten Bytes**: Liefert ein Eintrag mehr als angegeben, bricht der Stream sofort ab.
- **Inhalt:** Länge und CRC-32 je Eintrag, SHA-256 und Grösse gegen das Manifest; Manifest-Liste = Inhalt des ZIP (nichts fehlt, nichts zusätzlich, keine Doppelten). Bilder müssen nach ihren Bytes PNG/JPEG/WebP passend zur Endung sein und die Masse aus AJ-07 einhalten.
- **Schreiber:** UTF-8-Namen, CRC und Grössen im lokalen Kopf **und** im Verzeichnis (lokaler Kopf wird nach dem Packen positionsgenau ergänzt, keine Datenbeschreibung), `fsync` vor dem Schliessen, Abbruch vor der 4-GiB-Grenze.

**Datenbank beim Import:** read-only und mit `trusted_schema = OFF` öffnen; `user_version` = Manifest; **Schema exakt wie von Lernjournal angelegt** (Vergleich mit den Migrationen auf einer leeren Datenbank im Speicher – keine zusätzlichen Tabellen, Trigger, Views; FTS5-Hilfstabellen nur nach Name, weil ihr SQL von der SQLite-Version abhängt); `integrity_check` (prüft auch CHECK/NOT NULL/UNIQUE) und `foreign_key_check`; UUIDs; jeder Journal-Inhalt nach dem Editor-Schema (`validateSections`, auch Link-Protokolle); Bildverweise nur `media/<id>.<Endung zum Format>`; jede Bilddatei braucht eine Zeile. Danach Migration, Suchindex **immer** neu aufbauen (abgeleitet, ADR 0004), nochmals `integrity_check`, dann normal öffnen (Sperre, `afterOpen`).

**Ablauf und Sicherheit:** Import nur in einen neuen oder leeren Ordner (Vorschlag `Dokumente\<Projekttitel>`, sonst Unterordner im gewählten Ordner); bei jedem Fehler wird entfernt, was der Import angelegt hat; das bisherige Projekt bleibt offen, bis der Import bestanden ist. Export: Temp-Datei neben dem Ziel, vollständig zurücklesen und prüfen (`verifyArchive`), dann atomar umbenennen (`fs-atomic.ts`). Die IPC-Kanäle `archive:*` nehmen keine Pfade an; Datei und Ordner stammen nur aus den nativen Dialogen des Hauptprozesses.

## Verworfen
- **fflate** (MIT, 0.8.3, schon Testabhängigkeit): `unzipSync` hält das ganze Archiv im Speicher und legt Ausgabepuffer nach der Grössenangabe im Kopf an; der Stream-Entpacker `Unzip` liest nur die lokalen Köpfe (nicht das zentrale Verzeichnis, das z. B. der Windows-Explorer zeigt) – genau die Widersprüche, die ein Angriff nutzt, wären unsichtbar. Die Prüfungen hätten wir ohnehin selbst schreiben müssen; übrig bliebe nur Deflate, das `node:zlib` schon kann. Bleibt Testabhängigkeit (Gegenprobe: liest unsere Archive, erzeugt manipulierte).
- **yauzl/yazl:** solide und streamend, aber zwei zusätzliche Laufzeitabhängigkeiten im Installer, Callback-API, und die formatspezifischen Prüfungen (Namen, Manifest, Grenzen je Dateiart) blieben trotzdem bei uns.
- **adm-zip, JSZip:** ganzes Archiv im Speicher; adm-zip mit ZIP-Slip-Vorgeschichte.
- **Eigenes Containerformat statt ZIP:** einfacher zu prüfen, aber Lernende und Support könnten die Datei nicht mehr mit Bordmitteln ansehen.
- **ZIP64:** erst ab 4 GiB nötig; vier Lehrjahre bleiben weit darunter. Weniger Code, weniger Angriffsfläche.
- **Datenbankdatei direkt kopieren:** im WAL-Modus nicht konsistent (bestätigte Änderungen stehen evtl. nur in `-wal`).
- **Manifest signieren:** ohne Geheimnis nicht fälschungssicher; die Prüfsummen schützen vor Übertragungs- und Datenträgerfehlern, gegen Manipulation schützen die Prüfungen von ZIP, Bildern und Datenbank.

## Konsequenzen
- **+** Keine neue Laufzeitabhängigkeit; volle Kontrolle über jede Grenze; wenig Arbeitsspeicher auch bei grossen Projekten.
- **+** Bausteine für AJ-15 (Sicherungen, ADR 0006): `snapshotDatabase`, ZIP-Leser/-Schreiber, `verifyImportedDatabase`, `finishImportedDatabase`, `writeAtomically`, Fortschritt über `lj:archive-progress`.
- **Nachtrag AJ-15:** `snapshotDatabase` kopiert seither aus einer eigenen, nur lesenden Verbindung in einem Schritt (vorher aus der Verbindung des Programms, die mit `SQLITE_LOCKED` abbrach, wenn während der Kopie gespeichert wurde). Import und Übergabe speichern den Zeitpunkt der letzten Übergabe (Schema v3).
- **−** Eigener ZIP-Code muss gepflegt werden; abgesichert durch Angriffstests (`zip.test.ts`, `archive.test.ts`) und die Gegenprobe mit fflate. Archive anderer Werkzeuge mit Ordnereinträgen oder zusätzlichen Dateien werden bewusst abgelehnt.
- **−** Eine Importkopie hat dieselbe Projekt-ID wie das Original (Identität des Lernjournals); die Oberfläche unterscheidet Projekte darum über ID **und** Pfad.
- Neue Dateiart im Projekt? `MEDIA_ENTRY`/`maxEntryBytes` erweitern, `ARCHIVE_FORMAT_VERSION` erhöhen und in `readManifest()` ältere Versionen umwandeln.
