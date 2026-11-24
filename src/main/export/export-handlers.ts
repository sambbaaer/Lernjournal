// Einzeldokument und Sammlung, DOCX oder PDF. Nur der native Dialog im
// Hauptprozess bestimmt den Speicherort. Der IPC-Vertrag verlangt R-10.
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { ExportFormat, ExportResult } from '@shared/export';
import type { Handlers } from '../ipc-handler';
import { ExportError, withExportExtension, type ExportService, type PdfPrinter } from './export-service';

export type ExportHandlerDeps = {
  service: ExportService;
  printPdf: PdfPrinter;
  chooseSavePath: (suggested: string, format: ExportFormat) => Promise<string | null>;
  showInFolder: (file: string) => void;
};

type ExportChannel =
  | 'export:journalDocx'
  | 'export:collectionDocx'
  | 'export:journalPdf'
  | 'export:collectionPdf'
  | 'export:showFile';

export function createExportHandlers(deps: ExportHandlerDeps): Pick<Handlers, ExportChannel> {
  let busy = false;
  // Die Oberfläche darf nur die zuletzt hier exportierte Datei anzeigen.
  let lastFile: string | null = null;
  const { service } = deps;

  async function save(format: ExportFormat, ids: string[], title?: string): Promise<ExportResult> {
    if (busy) throw new ExportError('Ein Export läuft bereits. Bitte einen Moment warten.');
    busy = true;
    try {
      service.assertJournalsExist(ids);
      const suggested =
        title === undefined
          ? service.suggestedName(ids[0]!, format)
          : service.suggestedCollectionName(title, format);
      const chosen = await deps.chooseSavePath(suggested, format);
      if (!chosen) return { status: 'canceled' };
      const target = withExportExtension(chosen, format);
      if (target !== chosen && existsSync(target)) {
        throw new ExportError(
          'Eine Datei mit diesem Namen ist bereits vorhanden. Bitte wähle den vollständigen Namen mit Endung oder einen anderen Namen.',
        );
      }
      const { bytes, warnings } =
        format === 'pdf'
          ? await service.exportPdf(ids, title, target, deps.printPdf)
          : title === undefined
            ? await service.exportJournalDocx(ids[0]!, target)
            : await service.exportCollectionDocx(ids, title, target);
      lastFile = target;
      return { status: 'saved', fileName: path.basename(target), bytes, warnings };
    } finally {
      busy = false;
    }
  }

  return {
    'export:journalDocx': ({ id }) => save('docx', [id]),
    'export:collectionDocx': ({ ids, title }) => save('docx', ids, title),
    'export:journalPdf': ({ id }) => save('pdf', [id]),
    'export:collectionPdf': ({ ids, title }) => save('pdf', ids, title),
    'export:showFile': () => {
      if (!lastFile) return { shown: false };
      deps.showInFolder(lastFile);
      return { shown: true };
    },
  };
}
