# Lernjournal im Microsoft Store – Einreichung vorbereiten

Stand: 2026-11-24, Version 0.1.0 (AJ-16b, [ADR 0008](adr/0008-microsoft-store-und-portable.md)). Diese Anleitung beschreibt, was im Projekt vorbereitet ist und welche Schritte in Partner Center nötig sind. Angaben zu Partner Center (Menüs, Grenzen, Kosten) können sich ändern – massgebend ist, was Partner Center beim Einreichen anzeigt.

**Lernjournal ist ein inoffizielles Hilfsmittel.** Es wird nicht von SBFI, dpsuisse oder Prüfungsorganen herausgegeben ([QUELLEN.md](QUELLEN.md), R-14). Das muss auch im Store-Eintrag stehen; keine Logos oder Namen der Verbände als Marke verwenden.

## Überblick
| Was | Wo |
|---|---|
| Store-Paket bauen | `npm run dist:store` (unter Windows) → `dist\Lernjournal-Store-<Version>.msix` |
| Identität aus Partner Center | Umgebungsvariablen `LERNJOURNAL_STORE_*` (unten) |
| Signatur | keine eigene nötig – der Store signiert das Paket bei der Einreichung |
| Testpaket der CI | Artefakt `lernjournal-msix-testsigniert` (Platzhalter-Identität, Testzertifikat) – **nicht** einreichen |
| Datenschutzerklärung | [docs/DATENSCHUTZ.md](DATENSCHUTZ.md) – öffentlich erreichbar unter `https://sambbaaer.github.io/Lernjournal/DATENSCHUTZ` bzw. `https://github.com/sambbaaer/Lernjournal/blob/main/docs/DATENSCHUTZ.md` |
| Alternative ohne Store | portable EXE (`npm run dist:exe`), Testinstaller (NSIS), siehe [IT-MERKBLATT.md](IT-MERKBLATT.md) |

## 1. Konto in Partner Center
1. Unter <https://partner.microsoft.com/dashboard> mit einem Microsoft-Konto als Entwickler für «Apps und Spiele» registrieren (Einzelperson oder Unternehmen). Kosten, Identitätsprüfung und Bedingungen zeigt Partner Center bei der Registrierung an.
2. Der hinterlegte **Herausgeber-Anzeigename** erscheint im Store unter der App (z. B. der eigene Name). Er wird später zu `LERNJOURNAL_STORE_PUBLISHER_DISPLAY_NAME`.

## 2. App-Namen reservieren
1. Partner Center → «Apps und Spiele» → «Neues Produkt» → «MSIX- oder PWA-App».
2. Namen **«Lernjournal»** reservieren. Ist er vergeben, einen anderen wählen (z. B. «Lernjournal für Lernende»). Der reservierte Name muss genau dem Anzeigenamen im Paket entsprechen – bei einem anderen Namen zusätzlich `LERNJOURNAL_STORE_DISPLAY_NAME` setzen (Standard «Lernjournal»).

## 3. Identitätswerte übernehmen
Partner Center → App → «Produktverwaltung» → **«Produktidentität»** (Product identity). Für Lernjournal sind im Partner Center registriert:

| Partner Center | Umgebungsvariable | Wert für Lernjournal |
|---|---|---|
| `Package/Identity/Name` | `LERNJOURNAL_STORE_IDENTITY_NAME` | `SamuelBaer.Lernjournal` |
| `Package/Identity/Publisher` | `LERNJOURNAL_STORE_PUBLISHER` | `CN=729E5805-5EBC-4960-8F61-C476DD08925A` |
| `Package/Properties/PublisherDisplayName` | `LERNJOURNAL_STORE_PUBLISHER_DISPLAY_NAME` | `Samuel Baer` |
| `Package Family Name (PFN)` | – (von Windows abgeleitet) | `SamuelBaer.Lernjournal_abrez5nvvm632` |
| `Store-ID` | – | `9PN4MDLRTM9H` |

Die Werte genau kopieren (Gross-/Kleinschreibung, `CN=` am Anfang). Die Build-Konfiguration nutzt ohne gesetzte Umgebungsvariablen weiterhin Test-Platzhalter (damit die GitHub-CI das MSIX mit einem selbstsignierten Testzertifikat bauen und installieren kann). Die **Application-Id** (`Lernjournal`) kommt nicht aus Partner Center und bleibt fest (`electron-builder.ts`, `STORE_APPLICATION_ID`).

Kontrolle, welche Identität verwendet würde: `npm run store:identity` (zeigt `"placeholder": false`, wenn die Werte gesetzt sind).

## 4. Store-Paket bauen
Unter Windows 10/11 in PowerShell, im Projektordner:
```powershell
npm ci
npm run check
$env:LERNJOURNAL_STORE_IDENTITY_NAME = 'SamuelBaer.Lernjournal'
$env:LERNJOURNAL_STORE_PUBLISHER = 'CN=729E5805-5EBC-4960-8F61-C476DD08925A'
$env:LERNJOURNAL_STORE_PUBLISHER_DISPLAY_NAME = 'Samuel Baer'
npm run dist:store
npm run verify:package
```
- `dist:store` (`scripts/dist-store.mjs`) bricht ab, solange Platzhalter gelten, prüft die Version und baut nur das MSIX, **unsigniert** (Signing-Variablen wie `CSC_LINK` werden für diesen Build entfernt – ein eigenes Zertifikat passt nicht zum Store-Publisher).
- `verify:package` (im selben Fenster, also mit denselben Variablen) prüft im MSIX: Identität, Version, Sprachen `de-CH`/`de`, nur die Fähigkeit `runFullTrust`, eigene Logos, Fuses des Programms.
- **Version:** `version` in `package.json` als `Major.Minor.Patch` ohne Zusatz (z. B. `1.0.0`); im Paket wird daraus `1.0.0.0` (die vierte Stelle ist im Store reserviert und muss 0 sein). Jede neue Einreichung braucht eine höhere Version.

## 5. Vor dem Einreichen testen
Das unsignierte Store-Paket lässt sich nicht direkt installieren. Getestet wird darum mit gleichem Inhalt:
- **Testpaket der CI** (Artefakt `lernjournal-msix-testsigniert`): MSIX mit Platzhalter-Identität, signiert mit einem Testzertifikat, das nur in diesem CI-Lauf existierte. Installieren: `Lernjournal-Testzertifikat.cer` in «Lokaler Computer → Vertrauenswürdige Personen» importieren (Adminrechte; der private Schlüssel ist vernichtet, niemand kann damit weiter signieren), dann die `.msix` doppelklicken. Danach das Zertifikat wieder entfernen.
- Die CI installiert dieses Paket bei jedem Push, führt den Selbsttest der installierten App aus (Projekt, Journal mit Bild, Suche, Word, `.ajournal`, Neustart, Import, Netzwerkprotokoll ohne Verbindung) und deinstalliert es wieder.
- **Windows App Certification Kit** (dieselben Prüfungen wie bei der Einreichung): CI-Job `zertifizierung` bei jedem Push (Bericht als Artefakt `lernjournal-wack-bericht`); lokal über das Windows SDK mit dem Testpaket. Stand: Windows App Certification Kit auf dem CI-Runner (Windows Server 2025, SDK 10.0.26100): **Gesamtergebnis PASS**; einziger Befund ist der optionale Test «Blocked executables» (findet im Paket Verweise auf Programme wie `cmd.exe` oder PowerShell, die unter Windows im S-Modus gesperrt sind – bei Electron-Programmen üblich; Lernjournal ruft solche Programme nicht auf). Einzelheiten im Protokoll des Jobs `zertifizierung` und im Bericht `lernjournal-wack-bericht`.
- Alternativ der NSIS-Testinstaller (Artefakt `lernjournal-windows`) – gleiches Programm, aber ohne Paketumgebung.

## 6. Einreichung in Partner Center
App → «Einreichung starten». Die Abschnitte:
1. **Preise und Verfügbarkeit:** kostenlos; Märkte nach Wunsch (mindestens Schweiz; Liechtenstein, Deutschland, Österreich möglich). Sichtbarkeit öffentlich.
2. **Eigenschaften:** Kategorie **Bildung** (Education). Datenschutzerklärung: Adresse der veröffentlichten [DATENSCHUTZ.md](DATENSCHUTZ.md). Website und Support-Kontakt (E-Mail oder Seite) eintragen. Bei den Produktangaben: kein Konto, keine Käufe, kein Internet nötig.
3. **Altersfreigaben:** Fragebogen (IARC) ehrlich ausfüllen. Sachlich zutreffend: keine Kommunikation zwischen Nutzerinnen und Nutzern, kein Teilen von Inhalten über die App, keine Standortabfrage, keine Käufe, keine Werbung, keine Gewalt oder Glücksspiele; Inhalte schreiben die Lernenden selbst und sie bleiben auf dem Gerät. Die Einstufung vergibt der Fragebogen.
4. **Pakete:** `dist\Lernjournal-Store-<Version>.msix` hochladen. Gerätefamilie: Desktop. Partner Center prüft, ob Identität und Publisher passen.
5. **Store-Einträge:** Sprachen gemäss Paket (`de-CH`, `de`); für mindestens eine Sprache einen Eintrag ausfüllen, am einfachsten für beide denselben Text (Entwurf unten).
6. **Einreichungsoptionen / Hinweise für die Zertifizierung:** Partner Center fragt nach einer Begründung für die eingeschränkte Fähigkeit `runFullTrust`. Vorschlag: «Lernjournal ist eine Desktop-App (Electron). runFullTrust ist für Desktop-Apps im MSIX-Paket nötig. Die App speichert alle Daten lokal im vom Benutzer gewählten Ordner und baut keine Netzwerkverbindungen auf.» Hinweis für die Tester: «Kein Konto nötig. Beim ersten Start einen Ordner für das Lernjournal anlegen (Vorschlag Dokumente\Lernjournal).»

Nach der Zertifizierung (Dauer zeigt Partner Center an) erscheint die App im Store. Updates: Version in `package.json` erhöhen, `npm run dist:store`, neue Einreichung mit dem neuen Paket. Die App selbst sucht nie nach Updates; der Store verteilt sie nach den Einstellungen des Geräts.

## 7. Entwurf Store-Eintrag (de-CH und de)
**Kurzbeschreibung**
> Lerndokumentation für Lernende Medientechnolog*innen EFZ: Journale schreiben, Bilder einfügen, durchsuchen und als Word-Dokument ausgeben – offline, ohne Konto.

**Beschreibung**
> Lernjournal hilft Lernenden Medientechnolog*innen EFZ, ihre Lerndokumentation zu führen (Lernberichte nach Art. 12 der Bildungsverordnung) und daraus ein persönliches Fachbuch aufzubauen. Im Mittelpunkt steht die Fachrichtung Print.
>
> Jedes Journal ist gegliedert in Auftrag, Durchführung und Reflexion. Texte werden frei formatiert, Bilder mit Legenden eingefügt. Über Kategorien, Schlagwörter, Verknüpfungen und eine Volltextsuche entsteht aus allen Journalen ein Fachbuch zum Nachschlagen. Einzelne oder mehrere Journale lassen sich als Word-Dokument ausgeben – mehrere mit Titelseite und Inhaltsverzeichnis.
>
> Lernjournal arbeitet vollständig offline: kein Konto, keine Cloud, keine Werbung, keine Nutzungsstatistik. Alle Daten liegen in einem Projektordner, den du selbst wählst. Das Programm sichert automatisch und erinnert daran, eine Kopie ausserhalb des Computers abzulegen (z. B. auf einem USB-Stick). Für den Umzug auf einen anderen Computer gibt es eine geprüfte Projektdatei (.ajournal).
>
> Inoffizielles Hilfsmittel: Lernjournal wird nicht von SBFI, dpsuisse oder Prüfungsorganen herausgegeben. Massgebend sind die Bildungsverordnung, der Bildungsplan und die Ausführungsbestimmungen zum Qualifikationsverfahren.

**Funktionen** (je eine Zeile)
- Journale mit den Abschnitten Auftrag, Durchführung und Reflexion
- Bilder mit Legenden; Metadaten wie GPS-Position werden beim Einfügen entfernt
- Kategorien, Schlagwörter und Verknüpfungen zwischen Journalen
- Fachbuch mit Volltextsuche, auch nach Wortteilen
- Word-Export einzelner Journale oder als Sammeldokument mit Inhaltsverzeichnis
- Automatische Sicherungen und Wiederherstellung
- Projektübergabe als .ajournal-Datei für einen anderen Computer
- Vollständig offline, ohne Konto, ohne Werbung, ohne Nutzungsstatistik
- Oberfläche in Schweizer Hochdeutsch, mit der Tastatur bedienbar

**Stichwörter** (Vorschlag): Lernjournal, Lerndokumentation, Medientechnologe, Lernbericht, Berufslehre, Fachbuch, Print

**Screenshots** (mindestens einer; Partner Center nennt die zulässigen Grössen, für Desktop z. B. 1366 × 768 Pixel oder grösser). Vorschlag mit einem Beispielprojekt ohne echte Kunden- oder Personendaten:
1. Journal im Editor mit Bild und Legende
2. Fachbuch mit Suchergebnis und markierten Treffern
3. Journalliste mit Kategorien und Filter
4. Export-Ansicht (Sammeldokument)
5. Startbildschirm bzw. Einrichtungsassistent

**Weitere Angaben:** Copyright «© <Jahr> <Name>»; Datenschutz-Adresse; Support-Kontakt. Keine Logos von SBFI oder dpsuisse, keine Microsoft-Marken im Bildmaterial (die Oberfläche ist Office-ähnlich, aber eigenständig).

## 8. Update einreichen (Neuerungen)

Für ein Update die Version in `package.json` erhöhen (Store-Version `x.y.z.0`), `npm run dist:store` bauen, in Partner Center eine neue Einreichung starten und das neue `.msix` hochladen. Text für das Feld «Neuerungen in dieser Version»:

**0.2.0**

- Neue Bausteine unter «Einfügen»: Hinweisboxen «Merke», «Achtung», «Tipp», Checklisten, Rechenblock und Störungstabelle.
- Fotos direkt beschriften: Pfeile, Kreise, Nummern und kurze Texte.
- Merkstellen: wichtige Stellen im Journal markieren, im Fachbuch als Register nachschlagen.
- Querverweise mit [[ auf Journale, Schlagwörter und Merkstellen.
- Schnellsuche mit Strg+K und eine ruhigere Startseite mit Fortschritt pro Semester.
- MCP-Zugang für Claude Desktop mit einem Klick eingerichtet (optional).
- Projekte, die mit 0.2.0 gespeichert wurden, brauchen Lernjournal 0.2.0 oder neuer.

## Was das Paket enthält und was nicht
- Fähigkeit nur `runFullTrust`; **kein** Internetzugriff deklariert, keine Dateizuordnung, kein Autostart, keine Hintergrunddienste.
- Befehlszeilen-Aufruf `lernjournal` (startet die App; nützlich für Konsole und den automatischen Test der CI).
- Logos aus dem eigenen Programmsymbol (`build/icon.svg` → `build/appx/`, `npm run icon`); keine fremden Bilder.
- Anzeigename «Lernjournal», Sprachen `de-CH` (Standard) und `de`, Windows 10 ab Version 2004 (10.0.19041) und Windows 11, x64.
