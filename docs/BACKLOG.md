# Lernjournal – umsetzbares MVP-Backlog

**Priorität:** alle AJ-01–AJ-17 = P0. In Reihenfolge der Abhängigkeiten implementieren. Für jedes Ticket: Funktion, Tests, Dokumentation.

| ID | Umsetzung | Abnahme |
|---|---|---|
| AJ-01 | Electron/Vite/React/TS/Tailwind Setup | Devstart auf Windows; sichere Preload-Bridge |
| AJ-02 | Office-nahe App-Shell | Datei-Menü, Ribbon-Tabs, Navigation, Dokumentfläche, Statusleiste, Tastatur |
| AJ-03 | Projektanlage/Öffnen/Profil | Frei wählbarer lokaler Ordner und Lehrbeginn |
| AJ-04 | SQLite-Schema/Migrationen/Lock | DB und Tabellen aus SPEC; Tests für Integrität |
| AJ-05 | Journal-CRUD und Status | erstellen, öffnen, duplizieren, archivieren, löschen |
| AJ-06 | Geführter Tiptap-Editor | Auftrag/Durchführung/Reflexion, Textformatierung |
| AJ-07 | Medien/Legenden | Bilder einfügen, lokal speichern und erneut laden |
| AJ-08 | Autosave und Fehlerzustände | korrekter Speicherstatus, Flush, Absturztest |
| AJ-09 | Kategorien/Tags | Mehrfachzuordnung, Umbenennen, Filter |
| AJ-10 | Journal-Verknüpfungen | Rückverweise sichtbar, keine Kopien |
| AJ-11 | Fachbuch und FTS5-Suche | Titel und Text durchsuchbar, Themenansichten |
| AJ-12 | Einzel-DOCX | In Word editierbar, Listen/Bilder/Legenden/Seitenzahlen |
| AJ-13 | Sammel-DOCX | Auswahl, Reihenfolge, Titelseite, TOC-Feld |
| AJ-14 | .ajournal Import/Export | versioniertes ZIP und sicherer Import komplett |
| AJ-15 | Backup/Restore | konsistent, Rotation, Wiederherstellung |
| AJ-16 | electron-builder Windows | Installer + portable EXE; Offline-Test |
| AJ-17 | Ende-zu-Ende-Abnahme | alle 11 P0-Tests aus SPEC bestanden |

**Phasen:** Fundament AJ-01–04; Editor AJ-05–08; Fachbuch AJ-09–11; Word AJ-12–13; Stabilisierung AJ-14–17.

**Definition of Done:** offline ohne Anmeldung; sichere IPC; persistente Daten; Tests für Fehler und Normalfall; UI Schweizer Hochdeutsch, Office-vertraut, zugänglich; keine vorgezogenen P1/P2-Funktionen.
