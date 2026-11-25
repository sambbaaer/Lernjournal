// Ende-zu-Ende-Test der Claude-Desktop-Brücke: echter LocalMcpServer, echte
// Brücke als eigener Node-Prozess (so wie Claude Desktop sie startet), stdio.
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { McpAccessStore } from './access';
import { LocalMcpServer } from './local-server';
import type { ToolDependencies } from './tools';

const BRIDGE = path.join(import.meta.dirname, 'bridge', 'lernjournal-bridge.mjs');

// Freien Port finden (der Server soll später auf genau diesem Port starten)
async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

// Brücke starten und Nachrichten zeilenweise austauschen
function startBridge(env: Record<string, string>) {
  const child = spawn(process.execPath, [BRIDGE], {
    env: { ...process.env, LERNJOURNAL_MCP_POLL_MS: '100', ...env },
  }) as ChildProcessWithoutNullStreams;
  const queue: unknown[] = [];
  const waiters: ((msg: unknown) => void)[] = [];
  createInterface({ input: child.stdout }).on('line', (line) => {
    const msg = JSON.parse(line);
    const waiter = waiters.shift();
    if (waiter) waiter(msg);
    else queue.push(msg);
  });
  let id = 0;
  return {
    child,
    next(): Promise<Record<string, unknown>> {
      const ready = queue.shift();
      if (ready) return Promise.resolve(ready as Record<string, unknown>);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Keine Antwort der Brücke')), 5000);
        waiters.push((msg) => {
          clearTimeout(timer);
          resolve(msg as Record<string, unknown>);
        });
      });
    },
    notify(method: string) {
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method })}\n`);
    },
    async request(method: string, params: object = {}) {
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params })}\n`);
      return this.next();
    },
  };
}

const init = {
  protocolVersion: '2025-11-25',
  capabilities: {},
  clientInfo: { name: 'Testclient', version: '1.0' },
};

describe('Claude-Desktop-Brücke', () => {
  let dir: string;
  let access: McpAccessStore;
  let bridges: ChildProcessWithoutNullStreams[];
  let servers: LocalMcpServer[];

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'lj-mcp-'));
    access = new McpAccessStore(path.join(dir, 'mcp.json'));
    bridges = [];
    servers = [];
  });

  afterEach(() => {
    for (const child of bridges) child.kill();
    for (const server of servers) server.stop();
    rmSync(dir, { recursive: true, force: true });
  });

  async function startServer(port: number) {
    const project = {};
    // Werkzeuge werden nur aufgelistet, nicht aufgerufen → leere Dienste genügen
    const server = new LocalMcpServer({
      ...({ version: '1.2.3' } as unknown as ToolDependencies),
      access,
      projectIdentity: () => project,
      changed: () => {},
      port,
    });
    servers.push(server);
    return server.start();
  }

  it('leitet Anfragen an Lernjournal weiter (auch mit «localhost»)', async () => {
    const port = await freePort();
    await startServer(port);
    const bridge = startBridge({
      LERNJOURNAL_MCP_URL: `http://localhost:${port}/mcp`,
      LERNJOURNAL_MCP_KEY: access.token,
    });
    bridges.push(bridge.child);
    const hello = await bridge.request('initialize', init);
    expect((hello.result as { serverInfo: { name: string; version: string } }).serverInfo).toEqual({
      name: 'Lernjournal',
      version: '1.2.3',
    });
    bridge.notify('notifications/initialized');
    const list = await bridge.request('tools/list');
    const names = (list.result as { tools: { name: string }[] }).tools.map((tool) => tool.name);
    expect(names).toContain('journal_search');
    expect(names).toContain('journal_propose_edit');
  });

  it('startet ohne Lernjournal und meldet die Werkzeuge, sobald es erreichbar ist', async () => {
    const port = await freePort();
    const bridge = startBridge({
      LERNJOURNAL_MCP_URL: `http://127.0.0.1:${port}/mcp`,
      LERNJOURNAL_MCP_KEY: access.token,
    });
    bridges.push(bridge.child);
    // Claude Desktop startet die Erweiterung, auch wenn Lernjournal zu ist
    const hello = await bridge.request('initialize', init);
    const result = hello.result as { protocolVersion: string; capabilities: object };
    expect(result.protocolVersion).toBe('2025-11-25');
    expect(result.capabilities).toEqual({ tools: { listChanged: true } });
    bridge.notify('notifications/initialized');
    const offline = await bridge.request('tools/list');
    expect((offline.result as { tools: { name: string }[] }).tools.map((t) => t.name)).toEqual([
      'lernjournal_verbindung',
    ]);
    const call = await bridge.request('tools/call', { name: 'lernjournal_verbindung', arguments: {} });
    const text = (call.result as { content: { text: string }[] }).content[0]!.text;
    expect(text).toContain('Einstellungen → MCP');

    // Jetzt öffnet die Lernende Lernjournal und aktiviert MCP
    await startServer(port);
    expect(await bridge.next()).toEqual({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' });
    const online = await bridge.request('tools/list');
    expect((online.result as { tools: unknown[] }).tools.length).toBe(6);
  });

  it('erklärt einen falschen oder erneuerten Zugangsschlüssel', async () => {
    const port = await freePort();
    await startServer(port);
    const bridge = startBridge({
      LERNJOURNAL_MCP_URL: `http://127.0.0.1:${port}/mcp`,
      LERNJOURNAL_MCP_KEY: access.token,
    });
    bridges.push(bridge.child);
    access.renew(); // Schlüssel in Lernjournal erneuert → alte Erweiterung ungültig
    await bridge.request('initialize', init);
    const call = await bridge.request('tools/call', { name: 'journal_search', arguments: {} });
    const text = (call.result as { content: { text: string }[] }).content[0]!.text;
    expect(text).toContain('Zugangsschlüssel passt nicht');
  });

  it('beendet sich, wenn Claude die Verbindung schliesst', async () => {
    const bridge = startBridge({ LERNJOURNAL_MCP_URL: 'http://127.0.0.1:9/mcp', LERNJOURNAL_MCP_KEY: 'x' });
    const exited = new Promise<number | null>((resolve) => bridge.child.once('exit', resolve));
    bridge.child.stdin.end();
    expect(await exited).toBe(0);
  });
});
