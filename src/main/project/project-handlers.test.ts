// Tests der Projekt-Handler: Freigabeliste, Zuletzt-Liste, automatisches Öffnen.
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Profile } from '@shared/ipc';
import { createProjectHandlers } from './project-handlers';
import { ProjectService } from './project-service';
import { readRecent } from './recent';

let root: string;
let services: ProjectService[] = [];
const profile: Profile = {
  displayName: 'Lea',
  company: null,
  apprenticeshipStart: null,
  specialization: 'print',
};

function setup(chosen: string | null = null) {
  const service = new ProjectService({
    appVersion: '0.1.0',
    env: {},
    lockEnv: { pid: 1, hostname: 'PC', isProcessAlive: () => true, now: () => new Date() },
  });
  services.push(service);
  const recentFile = path.join(root, 'recent.json');
  const docs = path.join(root, 'Dokumente');
  mkdirSync(docs, { recursive: true });
  const shownFolders: string[] = [];
  const h = createProjectHandlers({
    service,
    recentFile,
    documentsDir: docs,
    chooseFolder: async () => chosen,
    showFolder: (dir) => shownFolders.push(dir),
  });
  return { h, service, recentFile, docs, shownFolders };
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'lj-h-'));
  services = [];
});
afterEach(() => {
  services.forEach((s) => s.close());
  rmSync(root, { recursive: true, force: true });
});

describe('Projekt-Handler', () => {
  it('schlägt Dokumente\\Lernjournal vor und erlaubt dort das Anlegen', async () => {
    const { h, docs } = setup();
    const state = await h['project:getState'](undefined);
    expect(state).toMatchObject({
      project: null,
      recent: [],
      suggestedLocation: path.join(docs, 'Lernjournal'),
    });
    const r = await h['project:create']({
      path: state.suggestedLocation,
      title: 'Lehre',
      profile,
      seedCategories: true,
    });
    expect(r.status).toBe('opened');
  });

  it('weist Pfade ab, die nicht aus Dialog, Vorschlag oder Zuletzt-Liste stammen', async () => {
    const { h } = setup();
    const fremd = path.join(root, 'irgendwo');
    expect(await h['project:create']({ path: fremd, title: 'X', profile, seedCategories: false })).toEqual({
      status: 'not-allowed',
    });
    expect(await h['project:open']({ path: fremd })).toEqual({ status: 'not-allowed' });
    expect(await h['project:inspectFolder']({ path: fremd })).toEqual({
      kind: 'not-allowed',
      syncProvider: null,
    });
  });

  it('im Dialog gewählte Ordner sind danach erlaubt', async () => {
    const chosen = path.join(root, 'Gewählt');
    const { h } = setup(chosen);
    expect(await h['project:chooseFolder']({ purpose: 'create' })).toEqual({ path: chosen });
    expect((await h['project:inspectFolder']({ path: chosen })).kind).toBe('new');
  });

  it('merkt sich Projekte und öffnet beim nächsten Start das zuletzt verwendete automatisch', async () => {
    const first = setup();
    const state = await first.h['project:getState'](undefined);
    await first.h['project:create']({
      path: state.suggestedLocation,
      title: 'Lehre',
      profile,
      seedCategories: false,
    });
    // Schliessen ist asynchron (Sicherung beim Schliessen, AJ-15). Ohne await
    // ist die Datenbank beim Löschen noch offen – unter Windows EPERM.
    await first.h['project:close'](undefined);
    expect(readRecent(first.recentFile)).toHaveLength(1);

    // «Neustart»: neuer Dienst, gleiche Zuletzt-Datei
    const second = setup();
    const s2 = await second.h['project:getState'](undefined);
    expect(s2.project?.title).toBe('Lehre');
  });

  it('entfernt verschwundene Projekte aus der Zuletzt-Liste', async () => {
    const first = setup();
    const state = await first.h['project:getState'](undefined);
    await first.h['project:create']({
      path: state.suggestedLocation,
      title: 'Lehre',
      profile,
      seedCategories: false,
    });
    // Schliessen ist asynchron (Sicherung beim Schliessen, AJ-15). Ohne await
    // ist die Datenbank beim Löschen noch offen – unter Windows EPERM.
    await first.h['project:close'](undefined);
    rmSync(state.suggestedLocation, { recursive: true, force: true });
    const second = setup();
    const s2 = await second.h['project:getState'](undefined);
    expect(s2.project).toBeNull();
    expect(await second.h['project:open']({ path: state.suggestedLocation })).toEqual({
      status: 'not-a-project',
    });
    expect(readRecent(second.recentFile)).toHaveLength(0);
  });

  it('zeigt nur den geöffneten Projektordner im Explorer an (ohne Pfad vom Renderer)', async () => {
    const { h, shownFolders } = setup();
    expect(h['project:showFolder'](undefined)).toEqual({ shown: false });
    const state = await h['project:getState'](undefined);
    await h['project:create']({
      path: state.suggestedLocation,
      title: 'Lehre',
      profile,
      seedCategories: false,
    });
    expect(h['project:showFolder'](undefined)).toEqual({ shown: true });
    expect(shownFolders).toEqual([state.suggestedLocation]);
  });
});
