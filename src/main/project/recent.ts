// Liste der zuletzt geöffneten Projekte (in den Benutzerdaten der App,
// nicht im Projektordner). Kaputte oder manipulierte Dateien werden ignoriert.
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { z } from 'zod';

const RecentSchema = z.array(
  z.object({ path: z.string().min(1), title: z.string(), lastOpened: z.string() }),
);
export type RecentProject = z.infer<typeof RecentSchema>[number];
export const MAX_RECENT = 10;

export function readRecent(file: string): RecentProject[] {
  try {
    const parsed = RecentSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
    return parsed.success ? parsed.data.slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

// Neuestes zuoberst, keine Duplikate (Windows-Pfade ohne Rücksicht auf Gross-/Kleinschreibung)
export function addRecent(list: RecentProject[], entry: RecentProject): RecentProject[] {
  const key = (p: string) => p.toLowerCase();
  return [entry, ...list.filter((r) => key(r.path) !== key(entry.path))].slice(0, MAX_RECENT);
}

export function removeRecent(list: RecentProject[], p: string): RecentProject[] {
  return list.filter((r) => r.path.toLowerCase() !== p.toLowerCase());
}

// Atomar schreiben: erst Hilfsdatei, dann umbenennen – nie eine halbe Datei
export function writeRecent(file: string, list: RecentProject[]): void {
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(list, null, 2));
  renameSync(tmp, file);
}
