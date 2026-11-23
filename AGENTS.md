# Agent-Anweisungen – Lernjournal

Lies README.md, docs/SPEC.md, docs/BACKLOG.md und docs/QUELLEN.md. SPEC ist massgeblich; QUELLEN.md trennt offizielle Vorgaben (BiVo, Bildungsplan, QV) von eigenen Produktentscheiden. Stand: Phase 0 (Spikes) abgeschlossen, Ergebnisse in docs/adr/ und spikes/; App-Code beginnt mit AJ-01.

- App-Name **Lernjournal**; Office-vertraute, eigenständige Desktop-UI, keine kopierten Microsoft-Assets.
- Windows, Electron + React/TS + Tiptap + SQLite (`node:sqlite`, ADR 0001) + `docx` (ADR 0002); offline-first.
- Ein Journal = ein Dokument; Fachbuch ist eine Sicht über dieselben Journale (Tags, Kategorien, Links, Suche), keine Duplikate.
- Editor: Auftrag, Durchführung, Reflexion, jeweils freie Rich-Text-Inhalte.
- Daten lokal als Projektordner; versionierte ZIP-Übergabe `.ajournal`; DOCX nur exportieren, nie stillschweigend synchronisieren.
- Keine Accounts, Cloud, KI, Klassenverwaltung oder Noten im MVP.
- Sicherheit: Electron `contextIsolation: true`, `nodeIntegration: false`, Sandbox, valide IPC, keine Renderer-FS/DB-Rechte.
- Migrationen, Datenintegrität, konsistente SQLite-Backups und Wiederherstellungstests obligatorisch.
- Texte Schweizer Hochdeutsch mit «…» und ss; Tastaturbedienung und gute Kontraste.
- Offizielle dpsuisse-/SBFI-Vorgaben nicht mit eigenen Bewertungsideen verwechseln; Zahlen aus Vorgaben (z. B. Anzahl QV-Lerndokumentationen) konfigurierbar halten, nie hart codieren.
- Fokus Fachrichtung **Print**; inoffizielles Hilfsmittel für Lernende, Einfachheit vor Vollständigkeit (alle Zuordnungen freiwillig).
- QV: mind. 12 Lernberichte, eingereicht mit der Aufgabenstellung **vor** der IPA, als PDF in PkOrg; Lerndokumentation ist Hilfsmittel während der IPA und wird nicht bewertet. Nicht mit dem IPA-«Arbeitsjournal» verwechseln.
- Ein Journal entspricht einer «Lerndokumentation» nach BiVo Art. 12; der Bildungsbericht ist Sache des Betriebs und kein App-Feature.
- Architekturentscheide als ADR unter docs/adr/; Spike-Code nur überführt (TS, Tests) übernehmen.
- Pro Ticket Tests und Dokumentationspflege; aktuelle Bibliotheksversionen erst bei Implementierung prüfen.
