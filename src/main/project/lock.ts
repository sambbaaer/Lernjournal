// Projektsperre (project.lock): verhindert, dass dasselbe Projekt zweimal
// gleichzeitig geöffnet wird – z. B. zweimal auf demselben PC oder auf zwei
// PCs über einen synchronisierten Ordner (OneDrive, Synology Drive).
//
// Die Sperrdatei wird «exklusiv» angelegt (Flag 'wx'): Gibt es sie schon,
// schlägt das Anlegen fehl. Das ist atomar, auch wenn zwei Programme
// gleichzeitig starten.
//
// Nach einem Absturz bleibt die Datei liegen («verwaiste Sperre»). Auf dem
// gleichen PC erkennen wir das daran, dass der eingetragene Prozess nicht mehr
// läuft. Von einem anderen PC können wir das nicht prüfen – dann fragt die
// Oberfläche nach, ob trotzdem geöffnet werden soll.
import { randomUUID } from 'node:crypto';
import { closeSync, openSync, readFileSync, unlinkSync, writeSync } from 'node:fs';
import { hostname } from 'node:os';
import path from 'node:path';

export const LOCK_FILE = 'project.lock';

export type LockInfo = {
  instanceId: string;
  pid: number;
  hostname: string;
  startedAt: string;
  appVersion: string;
};

export type LockResult =
  | { status: 'acquired'; lock: ProjectLock; tookOverStale: boolean }
  // Läuft auf diesem PC noch – zweites Öffnen verhindern
  | { status: 'locked-here'; holder: LockInfo }
  // Auf anderem PC gesperrt (oder Datei unlesbar) – Rückfrage nötig
  | { status: 'locked-elsewhere'; holder: LockInfo | null };

// Für Tests austauschbar: Läuft ein Prozess mit dieser PID?
export type Env = {
  pid: number;
  hostname: string;
  isProcessAlive: (pid: number) => boolean;
  now: () => Date;
};

export const defaultEnv: Env = {
  pid: process.pid,
  hostname: hostname(),
  isProcessAlive: (pid) => {
    try {
      process.kill(pid, 0); // Signal 0 prüft nur die Existenz, beendet nichts
      return true;
    } catch (err) {
      // EPERM: Prozess existiert, gehört aber jemand anderem → gilt als lebendig
      return (err as NodeJS.ErrnoException).code === 'EPERM';
    }
  },
  now: () => new Date(),
};

export class ProjectLock {
  constructor(
    readonly file: string,
    readonly info: LockInfo,
  ) {}

  // Gibt die Sperre frei – aber nur, wenn sie noch UNS gehört (instanceId).
  release(): void {
    const current = readLock(this.file);
    if (current?.instanceId === this.info.instanceId) {
      try {
        unlinkSync(this.file);
      } catch {
        /* schon weg: in Ordnung */
      }
    }
  }
}

function readLock(file: string): LockInfo | null {
  try {
    const data = JSON.parse(readFileSync(file, 'utf8')) as Partial<LockInfo>;
    if (
      typeof data.instanceId !== 'string' ||
      typeof data.pid !== 'number' ||
      typeof data.hostname !== 'string'
    ) {
      return null;
    }
    return data as LockInfo;
  } catch {
    return null;
  }
}

function tryCreate(file: string, info: LockInfo): boolean {
  let fd: number;
  try {
    fd = openSync(file, 'wx');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw err;
  }
  try {
    writeSync(fd, JSON.stringify(info, null, 2));
  } finally {
    closeSync(fd);
  }
  return true;
}

export function acquireLock(
  projectDir: string,
  appVersion: string,
  options: { force?: boolean; env?: Env } = {},
): LockResult {
  const env = options.env ?? defaultEnv;
  const file = path.join(projectDir, LOCK_FILE);
  const info: LockInfo = {
    instanceId: randomUUID(),
    pid: env.pid,
    hostname: env.hostname,
    startedAt: env.now().toISOString(),
    appVersion,
  };

  if (tryCreate(file, info))
    return { status: 'acquired', lock: new ProjectLock(file, info), tookOverStale: false };

  const holder = readLock(file);
  const sameHost = holder !== null && holder.hostname === env.hostname;
  const stale = sameHost && holder.pid !== env.pid && !env.isProcessAlive(holder.pid);

  // Auf diesem PC noch aktiv: nie übernehmen, auch nicht mit force
  if (sameHost && !stale) return { status: 'locked-here', holder: holder! };
  // Anderer PC (oder unlesbare Datei): nur nach ausdrücklicher Bestätigung
  if (!sameHost && !options.force) return { status: 'locked-elsewhere', holder };
  // Verwaiste Sperre (oder bewusst übernommen): ersetzen
  try {
    unlinkSync(file);
  } catch {
    /* evtl. gleichzeitig entfernt */
  }
  if (tryCreate(file, info))
    return { status: 'acquired', lock: new ProjectLock(file, info), tookOverStale: true };
  // Jemand anderes war schneller
  const now = readLock(file);
  return now?.hostname === env.hostname
    ? { status: 'locked-here', holder: now }
    : { status: 'locked-elsewhere', holder: now };
}
