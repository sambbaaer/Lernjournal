// IPC-Handler für Projekt und Profil. Verbindet Oberfläche, Freigabeliste,
// Zuletzt-Liste und Projektdienst. Electron-Teile (Dialog) kommen als
// Funktion herein, damit alles mit Vitest prüfbar bleibt.
import path from 'node:path';
import type { OpenResult } from '@shared/ipc';
import type { Handlers } from '../ipc-handler';
import { PathGuard } from './path-guard';
import type { ProjectService } from './project-service';
import { addRecent, readRecent, removeRecent, writeRecent, type RecentProject } from './recent';

export type ProjectHandlerDeps = {
  service: ProjectService;
  recentFile: string;
  documentsDir: string;
  chooseFolder: (purpose: 'create' | 'open') => Promise<string | null>;
  now?: () => Date;
};

type ProjectChannels =
  | 'project:getState'
  | 'project:chooseFolder'
  | 'project:inspectFolder'
  | 'project:create'
  | 'project:open'
  | 'project:close'
  | 'profile:update';

export function createProjectHandlers(deps: ProjectHandlerDeps): Pick<Handlers, ProjectChannels> {
  const guard = new PathGuard();
  const now = deps.now ?? (() => new Date());
  let recent: RecentProject[] = readRecent(deps.recentFile);
  recent.forEach((r) => guard.allow(r.path));
  let autoOpenTried = false;

  // Vorschlag: Dokumente\Lernjournal, sonst «Lernjournal 2», «Lernjournal 3» …
  function suggestedLocation(): string {
    for (let i = 1; i < 100; i++) {
      const candidate = path.join(deps.documentsDir, i === 1 ? 'Lernjournal' : `Lernjournal ${i}`);
      const { kind } = deps.service.inspectFolder(candidate);
      if (kind === 'new' || kind === 'empty') {
        guard.allow(candidate);
        return candidate;
      }
    }
    return deps.documentsDir;
  }

  function remember(result: OpenResult): OpenResult {
    if (result.status === 'opened') {
      recent = addRecent(recent, {
        path: result.project.path,
        title: result.project.title,
        lastOpened: now().toISOString(),
      });
      guard.allow(result.project.path);
      try {
        writeRecent(deps.recentFile, recent);
      } catch (err) {
        console.error('[projekt] Zuletzt-Liste nicht gespeichert:', err);
      }
    }
    return result;
  }

  return {
    'project:getState': async () => {
      // Beim ersten Aufruf nach dem Start: zuletzt verwendetes Projekt still öffnen.
      // Klappt das nicht (gesperrt, verschoben …), erscheint einfach der Startbildschirm.
      if (!autoOpenTried && !deps.service.isOpen && recent[0]) {
        autoOpenTried = true;
        try {
          const r = await deps.service.open(recent[0].path);
          remember(r);
        } catch (err) {
          console.error('[projekt] Automatisches Öffnen fehlgeschlagen:', err);
        }
      }
      autoOpenTried = true;
      return {
        project: deps.service.isOpen ? deps.service.info() : null,
        recent,
        suggestedLocation: suggestedLocation(),
      };
    },

    'project:chooseFolder': async ({ purpose }) => {
      const chosen = await deps.chooseFolder(purpose);
      if (chosen) guard.allow(chosen);
      return { path: chosen };
    },

    'project:inspectFolder': ({ path: p }) => {
      if (!guard.isAllowed(p)) return { kind: 'not-allowed', syncProvider: null };
      return deps.service.inspectFolder(p);
    },

    'project:create': async ({ path: p, title, profile, seedCategories }) => {
      if (!guard.isAllowed(p)) return { status: 'not-allowed' };
      return remember(await deps.service.create({ dir: p, title, profile, seedCategories }));
    },

    'project:open': async ({ path: p, force }) => {
      if (!guard.isAllowed(p)) return { status: 'not-allowed' };
      const result = await deps.service.open(p, { force: force ?? false });
      // Verschwundenes Projekt aus der Liste nehmen
      if (result.status === 'not-a-project') {
        recent = removeRecent(recent, p);
        try {
          writeRecent(deps.recentFile, recent);
        } catch {
          /* nicht kritisch */
        }
      }
      return remember(result);
    },

    'project:close': () => ({ closed: deps.service.close() }),

    'profile:update': (profile) => deps.service.updateProfile(profile),
  };
}
