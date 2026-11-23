// Tests der Projektsperre mit simulierter Umgebung (PID, Rechnername).
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { acquireLock, LOCK_FILE, type Env } from './lock';

let dir: string;
const env = (over: Partial<Env> = {}): Env => ({
  pid: 100,
  hostname: 'PC-LERNENDE',
  isProcessAlive: () => true,
  now: () => new Date('2026-11-23T10:00:00Z'),
  ...over,
});
const writeLock = (data: object | string) =>
  writeFileSync(path.join(dir, LOCK_FILE), typeof data === 'string' ? data : JSON.stringify(data));

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'lj-lock-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('Projektsperre', () => {
  it('legt die Sperre an und gibt sie wieder frei', () => {
    const r = acquireLock(dir, '0.1.0', { env: env() });
    expect(r.status).toBe('acquired');
    const info = JSON.parse(readFileSync(path.join(dir, LOCK_FILE), 'utf8'));
    expect(info).toMatchObject({ pid: 100, hostname: 'PC-LERNENDE', appVersion: '0.1.0' });
    if (r.status === 'acquired') r.lock.release();
    expect(existsSync(path.join(dir, LOCK_FILE))).toBe(false);
  });

  it('verhindert zweites Öffnen auf demselben PC – auch mit force', () => {
    acquireLock(dir, '0.1.0', { env: env({ pid: 100 }) });
    expect(acquireLock(dir, '0.1.0', { env: env({ pid: 200 }) }).status).toBe('locked-here');
    expect(acquireLock(dir, '0.1.0', { env: env({ pid: 200 }), force: true }).status).toBe('locked-here');
  });

  it('erkennt eine verwaiste Sperre nach einem Absturz und übernimmt sie', () => {
    writeLock({
      instanceId: 'alt',
      pid: 4242,
      hostname: 'PC-LERNENDE',
      startedAt: '2026-11-22T08:00:00Z',
      appVersion: '0.1.0',
    });
    const r = acquireLock(dir, '0.1.0', { env: env({ isProcessAlive: (pid) => pid !== 4242 }) });
    expect(r).toMatchObject({ status: 'acquired', tookOverStale: true });
  });

  it('Sperre von anderem PC: Rückfrage, Übernahme nur mit force', () => {
    writeLock({
      instanceId: 'x',
      pid: 1,
      hostname: 'PC-BETRIEB',
      startedAt: '2026-11-23T07:00:00Z',
      appVersion: '0.1.0',
    });
    const r = acquireLock(dir, '0.1.0', { env: env() });
    expect(r).toMatchObject({ status: 'locked-elsewhere', holder: { hostname: 'PC-BETRIEB' } });
    expect(acquireLock(dir, '0.1.0', { env: env(), force: true })).toMatchObject({
      status: 'acquired',
      tookOverStale: true,
    });
  });

  it('unlesbare Sperrdatei gilt als «anderswo gesperrt» (sicherer Fall)', () => {
    writeLock('kein json');
    expect(acquireLock(dir, '0.1.0', { env: env() })).toEqual({ status: 'locked-elsewhere', holder: null });
  });

  it('gibt nur die eigene Sperre frei, nie eine fremde', () => {
    const r = acquireLock(dir, '0.1.0', { env: env() });
    writeLock({ instanceId: 'fremd', pid: 1, hostname: 'PC-BETRIEB', startedAt: '', appVersion: '0.1.0' });
    if (r.status === 'acquired') r.lock.release();
    expect(existsSync(path.join(dir, LOCK_FILE))).toBe(true);
  });
});
