// Erkennt, ob ein Ordner in einem Cloud-synchronisierten Verzeichnis liegt.
// Grund (SPEC): Synchronisierungsdienste können eine geöffnete SQLite-Datei
// mitten im Schreiben kopieren oder Konfliktkopien erzeugen. Wir verbieten
// es nicht, zeigen aber eine deutliche Warnung.
import path from 'node:path';

const NAME_PATTERNS: { provider: string; pattern: RegExp }[] = [
  { provider: 'OneDrive', pattern: /(^|[\\/])OneDrive( - [^\\/]+)?([\\/]|$)/i },
  { provider: 'Dropbox', pattern: /(^|[\\/])Dropbox([\\/]|$)/i },
  {
    provider: 'Google Drive',
    pattern: /(^|[\\/])(Google Drive|GoogleDrive|My Drive|Meine Ablage)([\\/]|$)/i,
  },
  { provider: 'iCloud Drive', pattern: /(^|[\\/])(iCloudDrive|iCloud Drive)([\\/]|$)/i },
  { provider: 'Synology Drive', pattern: /(^|[\\/])SynologyDrive([\\/]|$)/i },
  { provider: 'Box', pattern: /(^|[\\/])Box( Sync)?([\\/]|$)/i },
];

// env: Windows setzt OneDrive-Pfade als Umgebungsvariablen (auch bei
// umbenannten Ordnern wie «OneDrive - Schule XY»).
export function detectSyncProvider(
  dir: string,
  env: Record<string, string | undefined> = process.env,
): string | null {
  const resolved = path.resolve(dir);
  for (const key of ['OneDrive', 'OneDriveCommercial', 'OneDriveConsumer']) {
    const root = env[key];
    if (root && isInside(resolved, path.resolve(root))) return 'OneDrive';
  }
  for (const { provider, pattern } of NAME_PATTERNS) if (pattern.test(resolved)) return provider;
  return null;
}

function isInside(child: string, parent: string): boolean {
  const rel = path.relative(parent.toLowerCase(), child.toLowerCase());
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}
