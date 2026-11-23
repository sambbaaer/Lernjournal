// Tests des IPC-Rahmens: Absender-, Kanal- und Datenprüfung.
import { describe, expect, it, vi } from 'vitest';
import { createIpcDispatcher, type Handlers } from './ipc-handler';

const info = {
  name: 'Lernjournal',
  version: '0.1.0',
  platform: 'win32',
  versions: { electron: '45', chrome: '140', node: '24' },
};
const trustedEvent = { senderFrame: { url: 'app://lernjournal/index.html' } };
const isTrusted = (url: string) => url.startsWith('app://lernjournal/');

function setup(overrides: Partial<Handlers> = {}) {
  // Für diese Tests genügt ein Kanal; die übrigen werden nie aufgerufen
  const handlers = { 'app:getInfo': vi.fn(() => info), ...overrides } as unknown as Handlers;
  return { handlers, dispatch: createIpcDispatcher(handlers, isTrusted) };
}

describe('createIpcDispatcher', () => {
  it('führt gültige Aufrufe aus und liefert ok/data', async () => {
    const { dispatch } = setup();
    await expect(dispatch('app:getInfo', trustedEvent, undefined)).resolves.toEqual({ ok: true, data: info });
  });

  it('weist fremde Absender ab, ohne den Befehl auszuführen', async () => {
    const { dispatch, handlers } = setup();
    const res = await dispatch('app:getInfo', { senderFrame: { url: 'https://boese.example' } }, undefined);
    expect(res).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    expect(handlers['app:getInfo']).not.toHaveBeenCalled();
  });

  it('weist Aufrufe ohne Frame ab', async () => {
    const { dispatch } = setup();
    expect(await dispatch('app:getInfo', { senderFrame: null }, undefined)).toMatchObject({ ok: false });
  });

  it('kennt nur Kanäle aus dem Vertrag (auch keine Prototyp-Tricks)', async () => {
    const { dispatch } = setup();
    for (const ch of ['fs:readFile', '__proto__', 'constructor', 'toString']) {
      expect(await dispatch(ch, trustedEvent, undefined)).toMatchObject({
        error: { code: 'UNKNOWN_CHANNEL' },
      });
    }
  });

  it('prüft die Daten gegen das Schema', async () => {
    const { dispatch, handlers } = setup();
    const res = await dispatch('app:getInfo', trustedEvent, { path: 'C:\\Windows' });
    expect(res).toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } });
    expect(handlers['app:getInfo']).not.toHaveBeenCalled();
  });

  it('gibt bei internen Fehlern keine Details an die Oberfläche', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { dispatch } = setup({
      'app:getInfo': () => {
        throw new Error('C:\\Users\\geheim\\journal.sqlite gesperrt');
      },
    });
    const res = await dispatch('app:getInfo', trustedEvent, undefined);
    expect(res).toEqual({ ok: false, error: { code: 'INTERNAL', message: 'Interner Fehler' } });
    expect(JSON.stringify(res)).not.toContain('geheim');
    spy.mockRestore();
  });
});
