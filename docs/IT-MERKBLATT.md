# Lernjournal – Merkblatt für Schul-IT und Lehrbetriebe

Stand: 2026-11-24, Version 0.1.0. Dieses Merkblatt beschreibt nur, was im Programm umgesetzt und in der automatischen Prüfung (Windows-CI) nachgewiesen ist. Offene Punkte stehen am Schluss.

## Was ist Lernjournal?
Ein Windows-Programm, mit dem Lernende Medientechnolog*innen EFZ ihre Lerndokumentation (BiVo Art. 12) führen: Journale schreiben, Bilder einfügen, durchsuchen, als Word-Dokument ausgeben, sichern. Lernjournal ist ein **inoffizielles Hilfsmittel** – weder vom Berufsverband noch von Behörden herausgegeben oder geprüft.

- Arbeitet **vollständig offline**: keine Konten, keine Cloud, keine Server, keine KI, keine Telemetrie.
- Die Daten gehören den Lernenden und liegen in einem **Projektordner**, den sie selbst wählen.

## Installation ohne Adminrechte
| | Installer | Portable Version |
|---|---|---|
| Datei (rund 100 MB) | `Lernjournal-Setup-<Version>.exe` | `Lernjournal-Portable-<Version>.exe` |
| Adminrechte | nein (Manifest `asInvoker`, keine UAC-Abfrage) | nein (`asInvoker`) |
| Programmordner | `%LOCALAPPDATA%\Programs\Lernjournal` | entpackt sich bei jedem Start nach `%TEMP%\Lernjournal-Portable`, wird beim Beenden gelöscht |
| Registry | nur `HKEY_CURRENT_USER` (Deinstallationseintrag) | keine Einträge |
| Verknüpfungen | Startmenü und Desktop «Lernjournal» | keine |
| Speicherplatz | rund 330 MB | rund 330 MB in `%TEMP%` während der Nutzung |
| Hilfsprogramm `elevate.exe` | nicht enthalten | enthalten (electron-builder legt es immer bei), wird von Lernjournal nie aufgerufen |

- Der Installer fragt nichts (Installation mit einem Klick) und startet das Programm danach.
- **Stille Installation** (Softwareverteilung): `Lernjournal-Setup-<Version>.exe /S` – installiert für den angemeldeten Benutzer, startet das Programm nicht. Anderer Zielordner: `/D=<Pfad>` (als letzter Parameter).
- Es wird **kein** Dienst, Treiber, geplanter Task oder Autostart-Eintrag eingerichtet. Dateizuordnungen (z. B. für `.ajournal`) richtet der Installer nicht ein.
- **Update:** neue Version über die alte installieren. Es gibt keine automatische Update-Prüfung und keine Update-Adresse im Programm. Daten bleiben unverändert im Projektordner; ältere Projekte werden beim ersten Öffnen umgewandelt, nachdem automatisch eine Sicherung angelegt wurde.

## Wo liegen welche Daten?
| Ort | Inhalt |
|---|---|
| **Projektordner** (von den Lernenden gewählt, Vorschlag `Dokumente\Lernjournal`) | `journal.sqlite` (alle Journale), `media\` (Bilder), `backups\` (automatische Sicherungen), `exports\` (Vorschlag für Word-Dateien), `project.lock` (verhindert gleichzeitiges Öffnen) |
| `%APPDATA%\Lernjournal` | Liste der zuletzt geöffneten Projekte (`recent-projects.json`) und technische Zwischenspeicher von Chromium; keine Journalinhalte |
| frei gewählte Orte | Word-Exporte (`.docx`) und Projektübergaben (`.ajournal`, z. B. auf einem USB-Stick) |

**Cloud-Ordner:** Liegt der Projektordner in OneDrive, Dropbox, Google Drive, iCloud Drive, Synology Drive oder Box, zeigt das Programm eine Warnung (Gefahr von Konflikten und beschädigten Dateien bei gleichzeitiger Synchronisation). Empfehlung: lokaler Ordner, nicht die OneDrive-Wurzel. **Achtung bei umgeleiteten Ordnern:** Wenn «Dokumente» per OneDrive-Ordnersicherung (Known Folder Move) in OneDrive liegt, liegt auch der Vorschlag `Dokumente\Lernjournal` dort – das Programm warnt dann; die Lernenden können einen anderen Ordner wählen. Gegen Geräteverlust empfiehlt das Programm regelmässig eine Projektübergabe (`.ajournal`) auf einen USB-Stick oder ein NAS (Erinnerung nach 30 Tagen).

## Netzwerk, Telemetrie, Datenschutz
- **Kein Internetzugriff.** Die Oberfläche lädt nur aus dem Programm selbst (eigenes Protokoll `app://`, strenge Content-Security-Policy). Der Wörterbuch-Download der Chromium-Rechtschreibprüfung zeigt auf das Programm selbst. Das Programm verwendet keinen Proxy.
- **Optionaler MCP-Zugang.** Nur nach Aktivierung in den Einstellungen lauscht Lernjournal auf `127.0.0.1` (Standardport `47651`). Der Zugangsschlüssel gilt für das geöffnete Projekt und die laufende Freigabe. Schreibvorschläge brauchen eine Bestätigung in Lernjournal, neue Entwürfe zusätzlich eine separate Freigabe. [MCP einrichten](MCP.md).
- **Nachweis:** Die automatische Prüfung startet das fertige Programm unter Windows mit dem Netzwerkprotokoll von Chromium (`--log-net-log`), legt ein Projekt an, schreibt ein Journal mit Bild, sucht, exportiert nach Word und `.ajournal`, startet neu und importiert – das Protokoll darf keine Verbindung, keine Namensauflösung und keine Anfrage an einen fremden Rechner enthalten. Zusätzlich sperrt die Prüfung ausgehende Verbindungen des Programms in der Windows-Firewall. Für die Freigabe sind also **keine Firewall- oder Proxy-Regeln** nötig.
- **Keine Telemetrie, keine Nutzungsstatistik, keine Absturzberichte** des Programms, keine Konten oder Anmeldung. Was Windows selbst tut (z. B. SmartScreen-Prüfung beim Herunterladen, Windows-Fehlerberichterstattung), richtet sich nach den Windows-Einstellungen des Geräts.
- **Datenschutz:** Projektdaten liegen lokal bei den Lernenden. Nach einer MCP-Freigabe kann der verbundene Client Journaltexte lesen und je nach Anbieter weitergeben. Vor dem Export erinnert Lernjournal an Geschäftsgeheimnisse, Kundendaten und erkennbare Personen. Beim Einfügen von Bildern werden Metadaten (inkl. GPS-Position) entfernt.

## Sicherheitsrahmen
- Electron 45 (Chromium 156) mit `contextIsolation`, `sandbox` und ohne `nodeIntegration` in der Oberfläche; die Oberfläche hat keinen Zugriff auf Dateien oder Datenbank, sondern nur auf eine schmale, geprüfte Schnittstelle zum Hauptprozess.
- **Electron-Fuses** (fest in der EXE gesetzt und in der CI an der fertigen EXE geprüft): `RunAsNode` aus (die EXE lässt sich nicht als Node.js missbrauchen), `NODE_OPTIONS` und `--inspect` wirkungslos, Programmcode nur aus `app.asar`, dessen Integrität beim Start geprüft wird. Die CI versucht diese Missbräuche an der fertigen EXE und erwartet, dass sie wirkungslos bleiben.
- Keine Navigation zu fremden Seiten, keine neuen Fenster, keine Berechtigungen (Kamera, Mikrofon, Standort usw.).
- Das Programm selbst läuft immer mit den Rechten des angemeldeten Benutzers (`asInvoker`).

## Signatur und SmartScreen
- **Aktueller Stand: Die EXE-Dateien sind nicht signiert.** Die Signatur ist vorbereitet (Zertifikat oder Azure Trusted Signing), aber noch kein Zertifikat beschafft.
- Folge: Nach dem Herunterladen zeigt Windows SmartScreen «Der Computer wurde durch Windows geschützt». Mit «Weitere Informationen» → «Trotzdem ausführen» lässt sich das Programm starten, sofern die Richtlinien des Geräts das erlauben. Auch signierte Programme können anfangs eine Warnung auslösen, bis sie genügend Reputation haben.
- Auf verwalteten Geräten (AppLocker, WDAC, Intune) sind unsignierte Programme oder Programme in Benutzerordnern (`%LOCALAPPDATA%`, `%TEMP%`) oft gesperrt.

## Freigabe auf verwalteten Geräten (Whitelisting)
Je nach Richtlinie eine der folgenden Regeln:
- **Pfadregel** für die Installation: `%LOCALAPPDATA%\Programs\Lernjournal\*` (EXE und DLL) – und für den Installer selbst bzw. dessen Ablageort. Für die portable Version zusätzlich `%TEMP%\Lernjournal-Portable\*`. Pfadregeln in benutzerbeschreibbaren Ordnern sind weniger streng; bevorzugt den Installer verwenden.
- **Hash-Regel:** Zu jeder Version liegt eine Datei `SHA256SUMS.txt` mit den SHA-256-Prüfsummen von Installer, portabler EXE und der installierten `Lernjournal.exe` bei. Hash-Regeln gelten nur für genau diese Version; bei aktivierten DLL-Regeln braucht es zusätzlich die mitgelieferten DLL-Dateien (`ffmpeg.dll`, `d3dcompiler_47.dll`, `dxcompiler.dll`, `vk_swiftshader.dll`, `vulkan-1.dll`, `electron_wer.dll`) – dann ist die Pfadregel einfacher.
- **Herausgeberregel:** erst möglich, wenn die Dateien signiert sind.
- Sperren die Richtlinien beides, kann die Schul-IT das Programm auch verteilen (stille Installation, siehe oben).

## Deinstallation
- Windows-Einstellungen → Apps → «Lernjournal» → Deinstallieren, oder still: `"%LOCALAPPDATA%\Programs\Lernjournal\Uninstall Lernjournal.exe" /S`.
- Entfernt werden Programmordner, Verknüpfungen und der Registry-Eintrag. **Projektordner werden nie gelöscht** (sie liegen ausserhalb und sind dem Deinstallationsprogramm unbekannt), `%APPDATA%\Lernjournal` bleibt ebenfalls (Zuletzt-Liste für eine spätere Neuinstallation). Wer auch diesen Ordner entfernen will: Deinstallation mit `--delete-app-data` oder den Ordner von Hand löschen. Dass Projektordner und App-Daten bei der gewöhnlichen Deinstallation bleiben, prüft die CI.
- Die portable Version hinterlässt nur `%APPDATA%\Lernjournal`.

## Systemvoraussetzungen
- Windows 10 (22H2) oder Windows 11, **64 Bit (x64)**. Eine ARM64-Version wird derzeit nicht gebaut; ob die x64-Version auf Windows 11 für ARM in der Emulation läuft, ist nicht getestet.
- Rund 330 MB Speicherplatz für das Programm, dazu der Projektordner (wächst mit den Bildern).
- Kein Microsoft Word nötig (Word-Dateien werden ohne Word erzeugt), keine weiteren Laufzeitumgebungen.
- Bildschirm ab 1024 × 640 Pixel.

## Offene Punkte (Stand dieses Merkblatts)
- Code-Signing: Zertifikat bzw. Azure Trusted Signing noch nicht eingerichtet.
- Test durch eine Person auf einem sauberen Windows 10 und Windows 11 mit **Standardbenutzer** und auf einem verwalteten Schul-/Firmengerät (AppLocker/Intune) steht noch aus (manuelle Checkliste der Ende-zu-Ende-Abnahme AJ-17, [ABNAHME.md](ABNAHME.md)). Die automatische Prüfung läuft auf einem Windows-Server-Abbild von GitHub mit Administratorkonto; «ohne Adminrechte» ist dort über Manifest, Zielordner und Registry nachgewiesen.
- Rechtschreibprüfung: Weil das Programm kein Wörterbuch aus dem Internet lädt, unterstreicht der Editor derzeit keine Tippfehler. Ein mitgeliefertes Wörterbuch ist geplant, aber noch nicht umgesetzt.
