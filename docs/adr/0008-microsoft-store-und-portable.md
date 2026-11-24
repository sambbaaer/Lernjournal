# ADR 0008 – Verteilung über den Microsoft Store (MSIX) und als portable EXE; NSIS als Testinstaller

- **Status:** angenommen (AJ-16b, 2026-11-24). Ersetzt in [ADR 0007](0007-paketierung-und-signing.md) den Hauptweg «Installer pro Benutzer» und den verworfenen Punkt «MSI/AppX»; alles andere aus ADR 0007 (Fuses, schlankes Paket, Selbsttest, Offline-Nachweis, Signing-Variablen für EXE-Dateien) gilt weiter.

## Kontext
Entscheid des Besitzers: Lernjournal erscheint im **Microsoft Store**, zusätzlich gibt es eine **portable EXE**. Gründe: Der Store installiert ohne Adminrechte, ohne SmartScreen-Warnung und ohne eigenes Code-Signing-Zertifikat (der Store signiert das Paket bei der Einreichung selbst); Updates verteilt der Store. Auf Schulgeräten ist der Store aber oft gesperrt – dafür bleibt die portable EXE. Der NSIS-Installer aus AJ-16 bleibt erhalten: Der Besitzer testet damit lokal, und Schul-IT ohne Store kann ihn verteilen.

Offene Voraussetzung: Die Identität aus Partner Center (Package/Identity/Name, Publisher «CN=…», PublisherDisplayName) gibt es erst nach der Reservierung des App-Namens.

## Entscheid
**Drei Windows-Ziele aus einem Build** (`npm run dist:win`, ein `win-unpacked` für alle): MSIX (`appx`-Ziel von electron-builder 26.18, Dateiendung `.msix`, x64), portable EXE, NSIS-Testinstaller. Einzeln: `npm run dist:store` (nur MSIX, Store-Release) und `npm run dist:exe` (portable + NSIS, z. B. signiert mit `LERNJOURNAL_REQUIRE_SIGNING=1`).

**Store-Identität nur über Umgebungsvariablen** (`electron-builder.ts`, `storeIdentity()`): `LERNJOURNAL_STORE_IDENTITY_NAME`, `LERNJOURNAL_STORE_PUBLISHER`, `LERNJOURNAL_STORE_PUBLISHER_DISPLAY_NAME` (alle drei oder keine), optional `LERNJOURNAL_STORE_DISPLAY_NAME`, falls der reservierte Name nicht «Lernjournal» ist. Ohne Variablen gelten auffällige Platzhalter (`PLATZHALTER.Lernjournal.Testbuild`, `CN=PLATZHALTER-Lernjournal-Testbuild`) – ein solches Paket lässt sich testen, aber nicht mit einem Store-Paket verwechseln. `LERNJOURNAL_REQUIRE_STORE_IDENTITY=1` (setzt `scripts/dist-store.mjs` selbst) bricht ab, solange Platzhalter gelten oder ein Wert «PLATZHALTER» enthält – analog `LERNJOURNAL_REQUIRE_SIGNING`. Die Werte werden nach dem AppxManifest-Schema vorgeprüft (Name 3–50 Zeichen `A–Z a–z 0–9 . -`, Publisher beginnt mit `CN=`).

**Application-Id fest `Lernjournal`.** Sie kommt nicht aus Partner Center, bildet aber mit der Paketfamilie die App-Kennung (AUMID), an der angeheftete Startmenü-Einträge hängen – darum Konstante statt Variable.

**Version:** `storeVersion()` macht aus `package.json` `x.y.z` → `x.y.z.0` (vierte Stelle im Store reserviert, `setBuildNumber: false`) und lehnt Vorabversionen ab – electron-builder würde `1.2.3-beta.1` still zu `1.2.3.0` machen.

**Manifest:** eigene Vorlage `build/appxmanifest.xml` (die von electron-builder plus Namensraum `uap3`; ein Test vergleicht die Platzhalter mit der Vorlage von electron-builder, damit ein Update nichts verliert). Sprachen `de-CH`, `de`; Anzeigename «Lernjournal»; `MinVersion` 10.0.19041.0 (Basis von Windows 10 22H2), `MaxVersionTested` 10.0.26100.0 (Windows 11 24H2 / Server 2025 der CI); Kachelfarbe aus dem Symbol. **Fähigkeiten nur `runFullTrust`** (Pflicht für Desktop-Apps) – kein `internetClient`, weil offline. Keine Dateizuordnung, kein Protokoll, kein Autostart.

**Einzige Erweiterung: Befehlszeilen-Aufruf `lernjournal`** (App Execution Alias, `build/appx-extensions.xml`). Er startet die App mit Paketidentität wie das Startmenü, gibt aber Umgebungsvariablen und Argumente des Aufrufers weiter. Nur so kann die CI den bestehenden Selbsttest (`LERNJOURNAL_SMOKE_TEST`) gegen die *installierte* Store-App laufen lassen; ein direkter Start der EXE im Paketordner liefe ohne Identität (ohne Umleitung der App-Daten) und wäre kein echter Nachweis. Nebennutzen: Start über «Ausführen» oder eine Konsole. Eine neue Eingangstür entsteht nicht: Der Selbsttest wirkte schon bisher nur über Umgebungsvariablen (ADR 0007), und die App wertet keine eigenen Befehlszeilen-Argumente aus.

**Logos aus `build/icon.svg`** (`npm run icon`, Liste in `scripts/appx-assets.ts`): StoreLogo, Square44x44Logo, Square150x150Logo, Wide310x150Logo, SmallTile, LargeTile je in 100/125/150/200/400 %, App-Symbol zusätzlich 16/24/32/48/256 px (auch `altform-unplated`/`lightunplated`), zusammen 45 PNG-Dateien (rund 350 KB). Fehlt eines der vier Standard-Logos, setzt electron-builder Beispielbilder ein, die die Store-Zertifizierung ablehnt – ein Test und `verify-package.mjs` prüfen das.

**Signierung:** Für den Store keine eigene (der Store signiert bei der Einreichung). `dist-store.mjs` entfernt darum `CSC_LINK`, Azure-Variablen und `LERNJOURNAL_REQUIRE_SIGNING` für diesen Build – ein eigenes Zertifikat passt nie zum Store-Publisher. Die **CI** erzeugt pro Lauf ein selbstsigniertes Testzertifikat (`New-SelfSignedCertificate`, Subject = Publisher-Platzhalter, Zweck Codesignatur), signiert das MSIX mit `signtool` aus dem Windows SDK direkt aus dem Zertifikatsspeicher (kein `.pfx`, kein Passwort, privater Schlüssel danach gelöscht) und legt nur das öffentliche Zertifikat (`.cer`) zum Testen bei. Portable EXE und NSIS bleiben unsigniert bzw. optional signiert über die Variablen aus ADR 0007.

**MSIX-Besonderheiten im Produktcode** – geprüft, eine Änderung nötig war keine:
- Programmordner `C:\Program Files\WindowsApps\…` ist schreibgeschützt (CI prüft das mit einem Schreibversuch als Administrator). Lernjournal schreibt nie neben das Programm (keine Pfade aus `execPath`/`resourcesPath`).
- **App-Daten-Umleitung:** Schreibzugriffe auf `%APPDATA%\Lernjournal` (Zuletzt-Liste `recent-projects.json`, Chromium-Zwischenspeicher) landen in `%LOCALAPPDATA%\Packages\<Paketfamilie>\LocalCache\Roaming\Lernjournal` und werden beim Deinstallieren gelöscht (CI weist beides nach). Folge: Nach einer Neuinstallation ist die Zuletzt-Liste leer; das Projekt öffnet man einmal über «Öffnen». Bestehende Daten einer früheren NSIS-Installation sieht die Store-App weiterhin (Windows zeigt beide Orte zusammen).
- **Projektordner** (Vorschlag `Dokumente\Lernjournal`, `app.getPath('documents')`), Sperrdatei `project.lock`, Sicherungen (`backups\` im Projektordner) und Exporte liegen ausserhalb von AppData und werden weder umgeleitet noch beim Deinstallieren gelöscht (CI: Projektordner samt `backups` bleibt).
- **Temp-Verzeichnis:** Nur Arbeitsdateien von Sicherung und `.ajournal`-Export (`os.tmpdir()`); das fertige Ergebnis entsteht atomar im Zielordner (`fs-atomic.ts`) – unabhängig davon, wohin Windows `%TEMP%` lenkt. Im Selbsttest der Store-App enthalten (Sicherung, Export, Import).
- **Dialoge** (`dialog.showSaveDialog`/`showOpenDialog`) und **«Im Ordner anzeigen»** (`shell.showItemInFolder`) sind gewöhnliche Win32-Aufrufe einer Full-Trust-App; der Selbsttest bestätigt Speichern-Dialoge ohne Anzeige, die Sichtprüfung bleibt manuell (ABNAHME.md).
- **Wiederherstellung** schreibt in einen neuen oder den bisherigen Projektordner – nicht betroffen.
- **Selbsttest-Modus** funktioniert über den Befehlszeilen-Aufruf (oben); das Programm meldet im Bericht `distribution: "store"` (`process.windowsStore`), die CI verlangt das.
- **Fuses und ASAR-Integrität:** verträglich. Das MSIX packt dieselbe `win-unpacked`-Fassung; die Fuses stehen in der EXE, der Integritäts-Hash von `app.asar` als Ressource in der EXE. Die Paketsignatur (`AppxSignature.p7x`, auch die des Stores) verändert keine Datei im Paket. Nachweis: `verify-package.mjs` liest die Fuses der EXE *im* MSIX und vergleicht `app.asar` byte-genau mit `win-unpacked`; der Fuse-Angriff des Selbsttests läuft auch gegen die installierte Store-App.
- **Verteilungsart sichtbar:** «Info» zeigt «Microsoft Store», «Portable Version» oder «Installierte Version» (`src/main/distribution.ts`) – hilft bei Rückfragen; das Verhalten ist überall gleich.

**Updates:** Die App sucht weiterhin nie selbst nach Updates und baut keine Verbindung auf. Store-Updates installiert Windows bzw. der Microsoft Store nach den Einstellungen des Geräts. Daten bleiben im Projektordner; Migrationen legen vorher eine Sicherung an (ADR 0006).

**CI** (`paket`): MSIX signieren, `verify-package.mjs` (Manifest: Identität, Version `x.y.z.0`, `de-CH`/`de`, nur `runFullTrust`, nur Befehlszeilen-Aufruf; Logos; Fuses; gleiche `app.asar`; SHA-256 inkl. MSIX), Zertifikat in `LocalMachine\TrustedPeople`, `Add-AppxPackage`, Ort und Schreibschutz, Firewall-Sperre, Selbsttest `fuses,create,reopen` mit Netzwerkprotokoll über den Befehlszeilen-Aufruf, App-Daten-Umleitung ohne Arbeitsordner, `Remove-AppxPackage` mit Prüfung, dass Paketordner weg und Projektordner samt Sicherungen da ist; danach wie bisher NSIS und portable. Job `zertifizierung` (nach `paket`, nur Hinweis): Windows App Certification Kit, falls auf dem Runner vorhanden, Bericht als Artefakt.

## Konsequenzen
- **+** Store-Installation ohne Adminrechte und ohne SmartScreen-Warnung; kein Zertifikat zu kaufen oder zu verlängern.
- **+** Die installierte Store-App wird bei jedem Push auf Windows geprüft – mit Paketidentität, nicht nur das entpackte Programm.
- **+** Unter Linux sichern Unit-Tests Identität, Version, Manifest-Vorlage, Fähigkeiten und alle Logo-Dateien ab (ein MSIX bauen geht nur unter Windows).
- **−** Bis Partner Center die Identität liefert, gibt es nur Testpakete. Das CI-MSIX lässt sich nur installieren, wenn man dem Testzertifikat vertraut (Adminrechte für `TrustedPeople`).
- **−** Store-Deinstallation löscht die Zuletzt-Liste (nicht die Projekte). Im IT-Merkblatt beschrieben.
- **−** Der Store kann auf Schulgeräten gesperrt sein; dann portable EXE (bzw. Testinstaller über die Schul-IT), mit den bekannten Hürden für unsignierte Programme.
- **−** Ein zusätzliches Manifest-Element (Befehlszeilen-Aufruf), das gepflegt werden muss; ein Test hält es auf das Programm `app\Lernjournal.exe` ausgerichtet.

## Verworfen
- **Nur NSIS, kein Store:** SmartScreen-Warnungen und Zertifikatskosten bleiben; der Besitzer will den Store.
- **MSIX selbst signieren und ausserhalb des Stores verteilen (Sideloading):** braucht ein öffentlich vertrauenswürdiges Zertifikat mit genau passendem Publisher; für Schulen ohne Store ist die portable EXE bzw. der Testinstaller einfacher.
- **`unvirtualizedResources` (App-Daten nicht umleiten):** eingeschränkte Fähigkeit, verlangt Begründung bei der Einreichung; die Umleitung betrifft nur die Zuletzt-Liste.
- **`internetClient`:** nicht nötig, widerspräche dem Offline-Anspruch.
- **Selbsttest über `Invoke-CommandInDesktopPackage`:** liefert weder Exitcode noch Ausgabe zuverlässig an den Aufrufer; der Befehlszeilen-Aufruf schon.
