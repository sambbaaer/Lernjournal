import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { McpAccessStore } from './access';
import { claudeCodeCommand, httpClientJson, writeMcpb } from './client-config';

describe('MCP-Zugang', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'lj-mcp-access-'));
    file = path.join(dir, 'userData', 'mcp.json');
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('behält den Schlüssel über Neustarts (neue Instanz) und erneuert ihn nur auf Wunsch', () => {
    const first = new McpAccessStore(file);
    const token = first.token;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(new McpAccessStore(file).token).toBe(token);
    const renewed = first.renew();
    expect(renewed).not.toBe(token);
    expect(new McpAccessStore(file).token).toBe(renewed);
  });

  it('merkt sich «automatisch aktivieren» (Standard: aus)', () => {
    const store = new McpAccessStore(file);
    expect(store.autoStart).toBe(false);
    store.setAutoStart(true);
    expect(new McpAccessStore(file).autoStart).toBe(true);
  });

  it('legt bei beschädigter Datei einen neuen Schlüssel an', () => {
    const store = new McpAccessStore(file);
    void store.token;
    writeFileSync(file, '{kaputt');
    expect(new McpAccessStore(file).token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('schreibt erst beim ersten Zugriff', () => {
    new McpAccessStore(file);
    expect(() => readFileSync(file)).toThrow();
  });
});

describe('Client-Einrichtungen', () => {
  const target = { endpoint: 'http://127.0.0.1:47651/mcp', token: 'a'.repeat(43), version: '1.4.0' };

  it('Claude-Desktop-Erweiterung enthält Manifest und Brücke mit Adresse und Schlüssel', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'lj-mcpb-'));
    try {
      const file = path.join(dir, 'Lernjournal.mcpb');
      await writeMcpb(file, target);
      const entries = unzipSync(readFileSync(file));
      expect(Object.keys(entries).sort()).toEqual(['manifest.json', 'server/lernjournal-bridge.mjs']);
      const manifest = JSON.parse(strFromU8(entries['manifest.json']!));
      expect(manifest).toMatchObject({
        manifest_version: '0.3',
        name: 'lernjournal',
        version: '1.4.0',
        server: {
          type: 'node',
          entry_point: 'server/lernjournal-bridge.mjs',
          mcp_config: {
            command: 'node',
            args: ['${__dirname}/server/lernjournal-bridge.mjs'],
            env: { LERNJOURNAL_MCP_URL: target.endpoint, LERNJOURNAL_MCP_KEY: target.token },
          },
        },
      });
      expect(strFromU8(entries['server/lernjournal-bridge.mjs']!)).toContain(
        'notifications/tools/list_changed',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('Befehl für Claude Code und JSON für HTTP-Clients', () => {
    expect(claudeCodeCommand(target)).toBe(
      `claude mcp add --transport http lernjournal http://127.0.0.1:47651/mcp --header "Authorization: Bearer ${target.token}"`,
    );
    expect(JSON.parse(httpClientJson(target))).toEqual({
      servers: {
        lernjournal: {
          type: 'http',
          url: target.endpoint,
          headers: { Authorization: `Bearer ${target.token}` },
        },
      },
    });
  });
});
