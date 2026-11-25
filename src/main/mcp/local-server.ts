import { timingSafeEqual } from 'node:crypto';
import { once } from 'node:events';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createMcpHandler, type McpHttpHandler } from '@modelcontextprotocol/server';
import { MCP_OFF, MCP_PORT, type McpStatus } from '@shared/mcp';
import type { McpAccessStore } from './access';
import { McpError } from './journal-edits';
import { McpProposals } from './proposals';
import { journalTools, type ToolDependencies } from './tools';

const LOOPBACK = '127.0.0.1';
const PATH = '/mcp';
// Adresse für Einrichtungen, solange MCP noch nicht läuft (fester Port)
export const DEFAULT_ENDPOINT = `http://${LOOPBACK}:${MCP_PORT}${PATH}`;
const MAX_BODY = 128 * 1024;

type Dependencies = ToolDependencies & {
  projectIdentity: () => object | null;
  changed: () => void;
  // Dauerhafter Zugangsschlüssel und «automatisch aktivieren» (access.ts)
  access: Pick<McpAccessStore, 'token' | 'autoStart' | 'setAutoStart' | 'renew'>;
  port?: number;
};

type Active = {
  project: object;
  server: Server;
  handler: McpHttpHandler;
  proposals: McpProposals;
  endpoint: URL | null;
};

export class LocalMcpServer {
  private active: Active | null = null;

  constructor(private readonly deps: Dependencies) {}

  status(): McpStatus {
    const session = this.active;
    const autoStart = this.deps.access.autoStart;
    if (!session?.endpoint || !this.isActive(session)) return { ...MCP_OFF, autoStart };
    return {
      endpoint: session.endpoint.href,
      allowDrafts: session.proposals.allowDrafts,
      proposals: session.proposals.list,
      autoStart,
      defaultPort: session.endpoint.href === DEFAULT_ENDPOINT || this.deps.port !== undefined,
    };
  }

  // Adresse und Schlüssel für Client-Einrichtungen. Funktioniert auch vor der
  // Aktivierung: Lernende können Claude zuerst einrichten und dann freigeben.
  target(): { endpoint: string; token: string } {
    const session = this.active;
    const endpoint = session?.endpoint && this.isActive(session) ? session.endpoint.href : DEFAULT_ENDPOINT;
    return { endpoint, token: this.deps.access.token };
  }

  setAutoStart(enabled: boolean): McpStatus {
    this.deps.access.setAutoStart(enabled);
    this.deps.changed();
    return this.status();
  }

  // Neuer Schlüssel gilt sofort; bereits verbundene Clients erhalten danach 401.
  renewToken(): McpStatus {
    this.deps.access.renew();
    this.deps.changed();
    return this.status();
  }

  async start(): Promise<McpStatus> {
    if (this.active) {
      if (!this.active.endpoint) throw new McpError('MCP wird bereits gestartet.');
      return this.status();
    }
    const project = this.deps.projectIdentity();
    if (!project) throw new McpError('Öffne zuerst ein Lernjournal-Projekt.');
    const proposals = new McpProposals(this.deps);
    const handler = createMcpHandler(
      () => journalTools(this.deps, proposals, () => this.requireActive(session)),
      {
        responseMode: 'json',
        maxRequestBodySize: MAX_BODY,
        maxSubscriptions: 8,
      },
    );
    const server = createServer(
      { requestTimeout: 15_000, headersTimeout: 10_000, keepAliveTimeout: 3000 },
      (request, response) => void this.handle(session, request, response),
    );
    server.maxConnections = 16;
    const session: Active = {
      project,
      server,
      handler,
      proposals,
      endpoint: null,
    };
    this.active = session;
    try {
      try {
        await listen(server, this.deps.port ?? MCP_PORT);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE' || this.deps.port !== undefined) throw err;
        this.requireActive(session);
        await listen(server, 0);
      }
      this.requireActive(session);
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('MCP-Port fehlt');
      session.endpoint = new URL(`http://${LOOPBACK}:${address.port}${PATH}`);
      server.on('error', () => {
        if (this.active === session) this.stop();
      });
      this.deps.changed();
      return this.status();
    } catch (err) {
      if (this.active === session) this.stop();
      // Ein Projektwechsel kann den Server noch vor dem erfolgreichen Bind stoppen.
      if (server.listening) this.closeListener(server);
      if (err instanceof McpError) throw err;
      throw new McpError('MCP konnte auf diesem Computer nicht gestartet werden.');
    }
  }

  stop(): McpStatus {
    const session = this.active;
    if (!session) return MCP_OFF;
    this.active = null;
    void session.handler.close().catch(() => {});
    if (session.server.listening) this.closeListener(session.server);
    this.deps.changed();
    return MCP_OFF;
  }

  setDrafts(allowed: boolean): McpStatus {
    this.current().proposals.setDrafts(allowed);
    return this.status();
  }

  decide(id: string, apply: boolean) {
    return this.current().proposals.decide(id, apply);
  }

  private current(): Active {
    const session = this.active;
    if (!session?.endpoint) throw new McpError('MCP ist nicht aktiv.');
    this.requireActive(session);
    return session;
  }

  private isActive(session: Active) {
    return this.active === session && this.deps.projectIdentity() === session.project;
  }

  private requireActive(session: Active) {
    if (!this.isActive(session)) throw new McpError('Das freigegebene Projekt ist nicht mehr geöffnet.');
  }

  private closeListener(server: Server) {
    server.close();
    server.closeAllConnections();
  }

  private async handle(session: Active, request: IncomingMessage, response: ServerResponse) {
    const reject = (status: number) => {
      response.writeHead(status, { 'Cache-Control': 'no-store', Connection: 'close' });
      response.end();
    };
    const endpoint = session.endpoint;
    if (!endpoint || !this.isActive(session)) return reject(503);
    // Schutz vor DNS-Rebinding: nur Aufrufe an 127.0.0.1 oder localhost (mit
    // unserem Port). «localhost» ist erlaubt, weil viele Clients und Anleitungen
    // diese Schreibweise verwenden – vorher gab das 403.
    const allowedHosts = [endpoint.host, `localhost:${endpoint.port}`];
    const origin = request.headers.origin;
    if (
      !allowedHosts.includes(request.headers.host ?? '') ||
      (origin !== undefined && !allowedHosts.some((host) => origin === `http://${host}`))
    )
      return reject(403);
    if (request.url !== PATH) return reject(404);
    const authorization = /^Bearer +([A-Za-z0-9_-]+)$/i.exec(request.headers.authorization ?? '');
    const supplied = Buffer.from(authorization?.[1] ?? '');
    const expected = Buffer.from(this.deps.access.token);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      response.setHeader('WWW-Authenticate', 'Bearer');
      return reject(401);
    }

    const abort = new AbortController();
    response.once('close', () => abort.abort());
    try {
      const headers = new Headers();
      for (const [name, value] of Object.entries(request.headers)) {
        if (name === 'authorization' || value === undefined) continue;
        headers.set(name, Array.isArray(value) ? value.join(', ') : value);
      }
      const init: RequestInit & { duplex: 'half' } = {
        method: request.method,
        headers,
        signal: abort.signal,
        duplex: 'half',
        ...(request.method === 'POST' && { body: Readable.toWeb(request) as ReadableStream<Uint8Array> }),
      };
      const result = await session.handler.fetch(new Request(endpoint, init));
      this.requireActive(session);
      result.headers.forEach((value, name) => response.setHeader(name, value));
      response.setHeader('Cache-Control', 'no-store');
      response.writeHead(result.status);
      if (result.body)
        await pipeline(Readable.fromWeb(result.body as Parameters<typeof Readable.fromWeb>[0]), response);
      else response.end();
    } catch {
      if (!response.headersSent && !response.destroyed) reject(500);
      else if (!response.destroyed) response.destroy();
    }
  }
}

async function listen(server: Server, port: number) {
  const ready = once(server, 'listening');
  server.listen({ host: LOOPBACK, port, exclusive: true });
  await ready;
}
