// IPC-Handler für den Word-Export (AJ-12). Setzen ein geöffnetes Projekt voraus.
//
// Ablauf «Journal als Word exportieren»:
//   1. Oberfläche zeigt den Exporthinweis (R-10) und schickt die Bestätigung mit
//   2. Hauptprozess zeigt den nativen Speichern-Dialog (Windows fragt selbst
//      nach, bevor eine bestehende Datei überschrieben wird – nie still)
//   3. Dokument bauen, atomar schreiben, Name/Grösse/Hinweise zurückmelden
// Der Renderer bekommt nie einen Pfad zum Schreiben in die Hand: Der Zielort
// stammt ausschliesslich aus dem Dialog im Hauptprozess.
import path from 'node:path';
import type { Handlers } from '../ipc-handler';
import { ExportError, withDocxExtension, type ExportService } from './export-service';

export type ExportHandlerDeps = {
  service: ExportService;
  // Nativer Speichern-Dialog; null = abgebrochen
  chooseSavePath: (suggested: string) => Promise<string | null>;
  // Datei im Explorer markieren (nur die zuletzt exportierte Datei)
  showInFolder: (file: string) => void;
};

export function createExportHandlers(
  deps: ExportHandlerDeps,
): Pick<Handlers, 'export:journalDocx' | 'export:showFile'> {
  let busy = false;
  // «Im Ordner anzeigen» darf nur die zuletzt hier exportierte Datei zeigen –
  // nie einen Pfad, den die Oberfläche schickt.
  let lastFile: string | null = null;

  return {
    'export:journalDocx': async ({ id }) => {
      if (busy) throw new ExportError('Ein Export läuft bereits. Bitte einen Moment warten.');
      busy = true;
      try {
        const chosen = await deps.chooseSavePath(deps.service.suggestedName(id));
        if (!chosen) return { status: 'canceled' as const };
        const target = withDocxExtension(chosen);
        const { bytes, warnings } = await deps.service.exportJournalDocx(id, target);
        lastFile = target;
        return { status: 'saved' as const, fileName: path.basename(target), bytes, warnings };
      } finally {
        busy = false;
      }
    },
    'export:showFile': () => {
      if (!lastFile) return { shown: false };
      deps.showInFolder(lastFile);
      return { shown: true };
    },
  };
}
