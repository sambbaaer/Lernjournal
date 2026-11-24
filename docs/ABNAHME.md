# Lernjournal – P0-Abnahme (AJ-17)

Stand: 2026-11-24, Version 0.1.0. Massgeblich sind die elf Punkte der SPEC «P0-Abnahme». Dieses Dokument hält fest, **womit** jeder Punkt automatisch nachgewiesen ist und **was noch von Hand** geprüft werden muss. Es steht nur drin, was ein Test oder ein CI-Lauf tatsächlich belegt.

**Ergebnis:** Alle 11 Punkte sind im automatisierten Teil bestanden – unter Linux lokal und auf `windows-latest` in der GitHub-CI (Jobs `windows` und `paket`). **Offen** sind die manuellen Prüfungen (Checkliste unten) und der **Pilot** mit 3–5 Lernenden ([PILOT.md](PILOT.md)). Erst danach gilt AJ-17 als ganz abgeschlossen.

## Testarten und Läufe
| Art | Befehl | Wo |
|---|---|---|
| Unit/Integration (Vitest, echte SQLite-Dateien) | `npm run check` | Linux lokal, Windows-CI Job `windows` |
| Ende-zu-Ende (Playwright gegen die gebaute App) | `npm run test:e2e`; unter Linux `E2E_EXTRA_ARGS=--no-sandbox xvfb-run -a npm run test:e2e` | Linux lokal, Windows-CI Job `windows` |
| Paket (Installer, portable EXE, Selbsttest mit Netzwerkprotokoll) | CI-Schritte, `scripts/self-test.mjs`, `scripts/verify-package.mjs` | nur Windows-CI Job `paket` |
| LibreOffice-Gegenprobe der DOCX | in `export.test.ts` / `collection.test.ts`, nur wenn `soffice` installiert ist | Linux lokal (unter Windows-CI übersprungen: kein LibreOffice) |

**Läufe für diese Abnahme:** Linux lokal: Vitest 485/485, E2E 78/78 (Node 22, Electron 45.4.1, `xvfb-run`). Windows-CI: Vitest bestanden (ohne LibreOffice-Gegenprobe), E2E 78/78, Paket-Job grün – siehe «CI-Stand» am Ende.

## Abnahme-Matrix

| # | P0-Abnahme (SPEC) | Automatischer Nachweis | Linux | Windows-CI | Manuell offen |
|---|---|---|---|---|---|
| 1 | Projekt offline anlegen (Profil mit Fachrichtung, Standard Print, Lehrbeginn), nach Neustart öffnen; neues Journal mit einem Klick und Titel | E2E `abnahme` «P0-1» (Print vorgewählt, Lehrbeginn, ein Klick auf «Neues Journal», Titel) und «P0-2» (Neustart öffnet von selbst); `project` «Assistent: Standardwerte, Profil, Anlegen, Neustart öffnet das Projekt automatisch»; `journal` «Strg+N legt ein Journal an …»; Unit `project.test.ts`, `project-handlers.test.ts` | ✔ | ✔ | – |
| 2 | Journal mit drei Abschnitten, mehreren Bildern/Legenden, Lernort und Metadaten dauerhaft speichern; Lehrjahr korrekt abgeleitet | E2E `abnahme` «P0-2» (drei Abschnitte, zwei Bilder mit Legenden, Lernort üK, Arbeitsdatum, «Automatisch (1./2. Lehrjahr)», alles nach Neustart); `images` «Bilder und Legenden überstehen einen Neustart»; `editor` «Inhalt übersteht einen Neustart»; Unit `school-year.test.ts` (13 Grenzfälle), `journal.test.ts` «Metadaten ändern; Lehrjahr berechnet und manuell überschreibbar», `media.test.ts` | ✔ | ✔ | – |
| 3 | Status, Duplizieren, Archivieren, Löschen sicher (Löschen mit Bestätigung, Medien aufgeräumt) | E2E `journal` (abschliessen/Entwurf, duplizieren, archivieren/wiederherstellen, löschen mit Rückfrage und Fokus auf «Abbrechen»), `abnahme` «P0-3» (Kopie hat eigene Bilddateien, Löschen entfernt sie von der Platte); Unit `journal.test.ts` «Löschen entfernt Journal, Zuordnungen, Suchindex und Bilddateien», «Duplizieren …» | ✔ | ✔ | – |
| 4 | Mehrfachkategorien/Tags/Links ohne Inhaltsduplikation; Vorschlag-Kategorien a–g vorhanden und änderbar | E2E `taxonomy` (mehrere Kategorien, Schlagwörter, umbenennen/zusammenführen/löschen, a–g wieder ergänzen, nach Neustart), `links` (Verknüpfung mit Rückverweis, Link im Text, «Erwähnt in», nach Neustart); Unit `taxonomy.test.ts` «Mehrfachzuordnung: … ohne Kopie des Inhalts», «Vorschläge a–g …», `links.test.ts` «liefert frische Titel/Status (keine Kopien)» | ✔ | ✔ | – |
| 5 | Volltextsuche findet Titel, Rich-Text-Begriffe und Bildlegenden, unabhängig von Gross-/Kleinschreibung | E2E `fachbuch` «Suche findet Titel, Text, Bildlegende und Schlagwort – Umlaute und Gross/Klein egal», «Suchindex neu aufbauen … und Suche nach Neustart»; Unit `search.test.ts` (Wortteile, Umlaut-Schreibweisen, Index-Prüfung, Migration) | ✔ | ✔ | – |
| 6 | Einzel-DOCX in Word bearbeitbar: echte Formate, Bilder/Legenden; Exporthinweis erscheint | E2E `export` «Menüband «Exportieren»: Hinweis R-10, Speichern, Inhalt der Word-Datei» (Hinweis, Bild als PNG in `word/media`), «Abbrechen …»; Unit `export.test.ts` (Golden Files für document/styles/numbering/footer/rels, Formatvorlagen, Listen, Tabellen, Legende «Abbildung n» mit SEQ-Feld, LibreOffice-Gegenprobe) | ✔ (inkl. LibreOffice) | ✔ (ohne LibreOffice) | **Öffnen und Bearbeiten in Word 365** |
| 7 | Drei Journale in einer DOCX zusammenfassen, Reihenfolge und TOC vorhanden | E2E `collection` «Auswahl mit Zeitraum, Reihenfolge per Tastatur, Export mit Titelseite und Inhaltsverzeichnis» (drei von vier Journalen nach Zeitraum, Reihenfolge per Tastatur geändert; in der Datei Titelseite, TOC-Feld, die drei Journale in gewählter Reihenfolge, Seitenumbrüche, Sprung zwischen Journalen, `updateFields`); Unit `collection.test.ts` (Golden Files, durchlaufende Abbildungsnummern, Sprünge, LibreOffice) | ✔ (inkl. LibreOffice) | ✔ | **Inhaltsverzeichnis in Word 365 aktualisieren** |
| 8 | Projekt-ZIP auf zweitem Windows-PC vollständig importierbar; manipuliertes ZIP (Pfad-Traversal, falsche Prüfsumme) abgelehnt | E2E `archive` «Import auf einem zweiten Computer …» (neue App mit leeren Benutzerdaten), «Manipulierte Datei …» (Pfad `../../`), «Falsche Prüfsumme …» (Bild verändert, kein Ordner bleibt zurück); Unit `zip.test.ts` (ZIP-Slip, Symlinks, Zip-Bombe …), `archive.test.ts` (Roundtrip, falsche/fehlende Hashes, manipulierte DB) | ✔ | ✔ | **Übergabe auf einen echten zweiten PC** (USB-Stick) |
| 9 | Bestätigte Speicherung übersteht erzwungenen Abbruch; Backup wiederherstellbar | Unit `crash.test.ts` «nach hartem Abbruch: Datei intakt, keine bestätigte Transaktion verloren» (Schreibprozess per SIGKILL); E2E `autosave` «Harter Absturz nach «Gespeichert» …» (ganze App, Windows: `taskkill /T /F`), «Fenster direkt nach dem Tippen schliessen …», «Gesperrte Datenbank …»; E2E `backup` «Wiederherstellen durch Ersetzen …»; Unit `backup.test.ts` (beide Wiederherstellungsarten, Konsistenz unter Schreiblast, beschädigte Sicherungen) | ✔ | ✔ | – |
| 10 | Komplett offline; Installer (ohne Adminrechte) und portable Build auf sauberem Windows getestet | CI-Job `paket`: bauen, `verify-package` (Fuses, `asInvoker`, Inhalt), Firewall-Sperre, Selbsttest der entpackten, **installierten** und **portablen** App mit Chromium-Netzwerkprotokoll (keine Verbindung erlaubt), stille Installation nach `%LOCALAPPDATA%` nur mit HKCU-Einträgen, Deinstallation lässt Daten; E2E `smoke` «Netzwerkzugriffe ins Internet werden blockiert», `self-test` | ✔ (Selbsttest der ungepackten App) | ✔ | **Standardbenutzer auf sauberem Windows 10/11** und **verwaltetes Gerät** (AppLocker/Intune); SmartScreen ohne Signatur |
| 11 | UI Office-vertraut, Tastaturbedienung, Kontrast und hohe DPI getestet | E2E `shell` (F6, Pfeiltasten, Alt+D/Esc, Tastenkürzel, nicht verfügbare Befehle, axe WCAG 2.2 AA, 1024 × 640, 150 % und 200 % Zoom); axe-Prüfungen zusätzlich in `project`, `journal`, `fachbuch`, `images`, `archive`, `backup`, `abnahme` u. a.; Kontraste der Farbtokens dokumentiert in `styles.css` | ✔ | ✔ | **NVDA-Stichprobe**, Windows-Kontrastdesign, echte 200-%-Anzeige |

Legende: ✔ = automatischer Nachweis im genannten Lauf bestanden.

## Bei der Abnahme gefunden und behoben
- **Strg+N mit sofortigem Tippen** (Produktfehler): Bis der Hauptprozess das neue Journal angelegt hatte, war noch das vorherige Journal sichtbar und im Fokus – wer gleich lostippte, änderte dessen Titel oder Text. Bei langsamer Platte oder unter Last betrifft das auch echte Nutzer. Jetzt blendet Strg+N das bisherige Journal sofort aus und zeigt einen Platzhalter mit Titelfeld; das Getippte übernimmt das neue Journal. Regressionstest mit absichtlich verzögertem Anlegen (`journal` «Strg+N und sofort tippen …»). Das war auch die Ursache des seit AJ-11 roten `e2e/fachbuch.test.mjs` und der unter Windows roten `taxonomy`-Tests.
- **Speicherstatus** (Produktfehler, SPEC «nur bei zutreffendem Zustand»): «Gespeichert» blieb stehen, während schon neue, ungespeicherte Änderungen vorlagen. Jetzt verschwindet es bei der ersten neuen Änderung und erscheint erst wieder, wenn alles gespeichert ist.
- **Windows-CI rot seit AJ-15** (Tests): Zeitüberläufe der Sicherungs-/Übergabetests (jedes COMMIT mit `synchronous=FULL` ist auf dem CI-Datenträger 20–30 × langsamer), danach unbehandelte Fehler eines weiterlaufenden Schreibers, und `EPERM` beim Löschen, weil ein Test das asynchrone Schliessen nicht abwartete. Tests schlanker (Kopie direkt statt acht ganzer Übergaben, kleinere Aufbewahrung), sicher endender Schreiber, Zeitlimit 60 s nur für die beiden betroffenen Dateien. Seither lief unter Windows auch die E2E-Suite wieder (sie wurde nach dem roten `npm run check` übersprungen).
- **Absturztest** (Test): wartete unter Umständen auf das Speichern des Titels statt des Textes.

## Manuelle Checkliste für den Besitzer
Mit dem Installer aus dem letzten CI-Lauf (Artefakt `lernjournal-windows`). Ergebnis und Datum direkt hier eintragen.

**A – Sauberes Windows 11 (oder 10 22H2), Standardbenutzer ohne Adminrechte**
- [ ] `Lernjournal-Setup-<Version>.exe` ausführen: keine UAC-Abfrage, Programm startet; SmartScreen-Warnung (unsigniert) notieren
- [ ] Projekt anlegen (Vorschlag `Dokumente\Lernjournal`), Profil mit Lehrbeginn, Journal mit Text und zwei Bildern
- [ ] Netzwerk trennen (Flugmodus) – alles funktioniert weiter
- [ ] Programm schliessen, neu starten: Projekt öffnet von selbst, Inhalt vollständig
- [ ] Portable EXE auf demselben Gerät starten (andere Instanz vorher schliessen)
- [ ] Deinstallieren: Projektordner bleibt erhalten

**B – Verwaltetes Schul- oder Firmengerät (AppLocker/Intune)**
- [ ] Installer bzw. portable EXE starten – erlaubt / blockiert? Meldung notieren, ggf. mit IT-Merkblatt freigeben lassen

**C – Word 365**
- [ ] Einzel-DOCX öffnen: Formatvorlagen «Überschrift 1/2», «Beschriftung», Listen, Tabelle, Bilder mit «Abbildung n», Fusszeile «Seite X von Y»; Text bearbeiten und speichern
- [ ] Sammel-DOCX mit drei Journalen: Titelseite, Frage «Felder aktualisieren» mit Ja beantworten → Inhaltsverzeichnis mit Seitenzahlen, jedes Journal auf neuer Seite, Sprünge zwischen Journalen

**D – Zweiter PC**
- [ ] «Projekt übergeben» auf USB-Stick, auf einem zweiten Windows-PC importieren: Journale, Bilder, Kategorien, Schlagwörter, Verknüpfungen, Suche vollständig

**E – Bedienung**
- [ ] Windows-Anzeige auf 200 % (Laptop mit 1920 × 1080): alles erreichbar, nichts abgeschnitten
- [ ] Windows-Kontrastdesign einschalten: Auswahl, Fokus und Knöpfe erkennbar
- [ ] NVDA-Stichprobe: Navigation, Journal öffnen, Abschnitte, Bildlegende, Statusmeldungen werden vorgelesen

**F – Pilot** mit 3–5 Lernenden der Fachrichtung Print: siehe [PILOT.md](PILOT.md)

## CI-Stand
| Commit | Job `windows` (Check + E2E) | Job `paket` |
|---|---|---|
| `6095b51` (AJ-17 WIP, Strg+N-Fix) | ✔ | ✔ |
| `1a97ec8` (AJ-17 WIP, Abnahme-E2E, letzter Code-Stand) | ✔ (Vitest bestanden, LibreOffice-Gegenprobe übersprungen; E2E 78/78) | ✔ |

Der abschliessende AJ-17-Commit ändert nur Dokumentation; die CI läuft dafür nicht (`paths-ignore` für `docs/**` und `*.md`). Massgeblich ist darum der Code-Stand `1a97ec8`.
