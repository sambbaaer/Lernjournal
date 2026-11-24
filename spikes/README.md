# Phase-0-Spikes

Wegwerf-Prototypen, die Risiken vor der eigentlichen Implementierung klären. Ergebnisse stehen als ADR in `docs/adr/`. Code hier ist **nicht** App-Code, darf aber als Vorlage übernommen werden.

| Spike | Frage | Ergebnis |
|---|---|---|
| `aj-00a-sqlite/` | Läuft SQLite (WAL, FTS5, Backup, Absturz) im gepackten Electron-Build unter Windows? | ja, mit `node:sqlite` → [ADR 0001](../docs/adr/0001-sqlite-adapter-node-sqlite.md); Online-Backup genutzt für `.ajournal` (AJ-14) und die Sicherungen inkl. vor Migrationen (AJ-15, ADR 0006) |
| `aj-00b-docx/` | Lässt sich Tiptap-JSON in echtes DOCX mit Bildern, Legenden und TOC übersetzen? | ja → [ADR 0002](../docs/adr/0002-docx-export.md), Word-Sichtprüfung offen; überführt nach `src/main/export/` (AJ-12, Sammel-DOCX AJ-13) |

## Selbst ausführen
```bash
cd spikes/aj-00a-sqlite && npm ci && npm run check:node && npm run check:electron
```
```bash
cd spikes/aj-00b-docx && npm ci && npm test && npm run build
```
Die DOCX-Beispiele landen in `spikes/aj-00b-docx/out/`. Unter Windows läuft alles auch über GitHub Actions (Workflow «Phase-0-Spikes»).
