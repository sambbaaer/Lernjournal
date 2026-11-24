// Verteilungsart des laufenden Programms (AJ-16b, ADR 0008): Microsoft Store
// (MSIX), portable EXE, installiert (NSIS-Testinstaller bzw. entpackter Build)
// oder Entwicklung. Rein informativ – das Programm verhält sich überall gleich:
//   - Daten liegen immer im Projektordner (Vorschlag Dokumente\Lernjournal),
//     den Windows auch unter MSIX nicht umleitet.
//   - Unter MSIX ist der Programmordner (C:\Program Files\WindowsApps\…)
//     schreibgeschützt; Lernjournal schreibt nie dorthin.
//   - Unter MSIX landen Schreibzugriffe auf %APPDATA% (Zuletzt-Liste,
//     Chromium-Zwischenspeicher) im Paketordner
//     %LOCALAPPDATA%\Packages\<Paketfamilie>\LocalCache und werden beim
//     Deinstallieren gelöscht. Das Programm merkt davon nichts (gleicher Pfad).
//
// process.windowsStore setzt Electron, wenn das Programm aus einem
// installierten MSIX/AppX-Paket läuft; PORTABLE_EXECUTABLE_DIR setzt der
// Starter der portablen EXE von electron-builder.
import type { Distribution } from '@shared/ipc';

export function detectDistribution(input: {
  isPackaged: boolean;
  windowsStore: boolean | undefined;
  portableExecutableDir: string | undefined;
}): Distribution {
  if (!input.isPackaged) return 'entwicklung';
  if (input.windowsStore === true) return 'store';
  if (input.portableExecutableDir) return 'portable';
  return 'installiert';
}
