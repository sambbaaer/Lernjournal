import { randomBytes, timingSafeEqual } from 'node:crypto';
import { once } from 'node:events';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createMcpHandler, type McpHttpHandler } from '@modelcontextprotocol/server';
import { MCP_OFF, MCP_PORT, type McpStatus } from '@shared/mcp';
import { McpError } from './journal-edits';
import { McpProposals } from './proposals';
import { journalTools, type ToolDependencies } from './tools';

const LOOPBACK = '127.0.0.1';
const PATH = '/mcp';
const MAX_BODY = 128 * 1024;

type Dependencies = ToolDependencies & {
  projectIdentity: () => object | null;
  changed: () => void;
  port?: number;
};

type Active = {
  project: object;
  token: string;
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
    if (!session?.endpoint || !this.isActive(session)) return MCP_OFF;
    return {
      endpoint: session.endpoint.href,
      allowDrafts: session.proposals.allowDrafts,
      proposals: session.proposals.list,
    };
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
      token: randomBytes(32).toString('base64url'),
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

  accessToken(): string {
    return this.current().token;
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
    if (
      request.headers.host !== endpoint.host ||
      (request.headers.origin !== undefined && request.headers.origin !== endpoint.origin)
    )
      return reject(403);
    if (request.url !== PATH) return reject(404);
    const authorization = /^Bearer +([A-Za-z0-9_-]+)$/i.exec(request.headers.authorization ?? '');
    const supplied = Buffer.from(authorization?.[1] ?? '');
    const expected = Buffer.from(session.token);
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
