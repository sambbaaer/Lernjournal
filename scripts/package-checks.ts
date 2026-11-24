// Prüfungen am fertigen Paket (AJ-16): Fuses in der EXE, Inhalt von app.asar,
// angeforderte Rechte von Installer und portabler EXE, Netzwerkprotokoll des
// Selbsttests. Reine Funktionen (ausser productionPackages) → mit Vitest
// getestet (scripts/packaging.test.ts) und von scripts/verify-package.mjs und
// scripts/self-test.mjs verwendet.
//
// Nur «löschbare» TypeScript-Syntax: Node führt die Datei direkt aus.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Electron-Fuses
// ---------------------------------------------------------------------------

// Markierung vor dem Fuse-Block in jeder Electron-EXE (wie @electron/fuses)
export const FUSE_SENTINEL = 'dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX';

// Position jedes Schalters im Block (Fuse-Version 1, wie @electron/fuses)
export const FUSE_INDEX = {
  runAsNode: 0,
  enableCookieEncryption: 1,
  enableNodeOptionsEnvironmentVariable: 2,
  enableNodeCliInspectArguments: 3,
  enableEmbeddedAsarIntegrityValidation: 4,
  onlyLoadAppFromAsar: 5,
  loadBrowserProcessSpecificV8Snapshot: 6,
  grantFileProtocolExtraPrivileges: 7,
} as const;
export type FuseName = keyof typeof FUSE_INDEX;

// Zustände werden als Zeichen gespeichert: '0' aus, '1' an
const FUSE_DISABLED = 0x30;
const FUSE_ENABLED = 0x31;

export type FuseWire = { version: number; states: number[] };

// Liest den Fuse-Block aus den Bytes einer Electron-EXE; null, wenn keiner da ist
export function readFuseWire(exe: Uint8Array): FuseWire | null {
  const buf = Buffer.from(exe.buffer, exe.byteOffset, exe.byteLength);
  const at = buf.indexOf(FUSE_SENTINEL, 0, 'latin1');
  if (at < 0) return null;
  const start = at + FUSE_SENTINEL.length;
  if (start + 2 > buf.length) return null;
  const version = buf[start]!;
  const length = buf[start + 1]!;
  if (start + 2 + length > buf.length) return null;
  return { version, states: [...buf.subarray(start + 2, start + 2 + length)] };
}

// Vergleicht die Fuses der EXE mit der Konfiguration (electron-builder.ts)
export function checkFuses(wire: FuseWire | null, expected: Partial<Record<FuseName, boolean>>): string[] {
  if (!wire) return ['Kein Fuse-Block in der EXE gefunden'];
  if (wire.version !== 1) return [`Unbekannte Fuse-Version ${wire.version}`];
  const problems: string[] = [];
  for (const [name, want] of Object.entries(expected) as [FuseName, boolean][]) {
    const state = wire.states[FUSE_INDEX[name]];
    const actual = state === FUSE_ENABLED ? true : state === FUSE_DISABLED ? false : undefined;
    if (actual === undefined) problems.push(`Fuse ${name}: unbekannter Zustand ${state}`);
    else if (actual !== want)
      problems.push(`Fuse ${name} ist ${actual ? 'an' : 'aus'}, erwartet ${want ? 'an' : 'aus'}`);
  }
  return problems;
}

// ---------------------------------------------------------------------------
// app.asar
// ---------------------------------------------------------------------------

export type AsarFile = { path: string; size: number; unpacked: boolean };

type AsarNode = { files?: Record<string, AsarNode>; size?: number; unpacked?: boolean; link?: string };

// Dateiliste aus dem Kopf von app.asar (Format von @electron/asar: Pickle mit JSON)
export function listAsarFiles(asar: Uint8Array): AsarFile[] {
  const buf = Buffer.from(asar.buffer, asar.byteOffset, asar.byteLength);
  if (buf.length < 16 || buf.readUInt32LE(0) !== 4) throw new Error('Keine gültige app.asar');
  const headerSize = buf.readUInt32LE(4);
  const jsonLength = buf.readUInt32LE(12);
  if (16 + jsonLength > 8 + headerSize || 8 + headerSize > buf.length) {
    throw new Error('Kopf von app.asar ist beschädigt');
  }
  const root = JSON.parse(buf.toString('utf8', 16, 16 + jsonLength)) as AsarNode;
  const out: AsarFile[] = [];
  const walk = (node: AsarNode, prefix: string) => {
    for (const [name, child] of Object.entries(node.files ?? {})) {
      const p = prefix ? `${prefix}/${name}` : name;
      if (child.files) walk(child, p);
      else out.push({ path: p, size: child.size ?? 0, unpacked: child.unpacked === true });
    }
  };
  walk(root, '');
  return out;
}

// Was im Paket sein muss, damit das Programm läuft
export const REQUIRED_APP_FILES = [
  'package.json',
  'out/main/index.js',
  'out/preload/index.cjs',
  'out/renderer/index.html',
  'node_modules/zod/package.json',
  'node_modules/docx/package.json',
  'node_modules/docx/dist/index.mjs', // diese Fassung lädt der Hauptprozess (ESM)
];

// Was nie ins Paket gehört: Quellen, Tests, Spikes, Golden Files, Doku, Builds
const FORBIDDEN: { pattern: RegExp; reason: string }[] = [
  {
    pattern: /^(src|e2e|spikes|docs|scripts|build|dist|release|test-results|\.github)\//,
    reason: 'Projektordner',
  },
  { pattern: /(^|\/)__golden__\//, reason: 'Golden File' },
  { pattern: /\.test\.[cm]?[jt]sx?$/, reason: 'Testdatei' },
  { pattern: /(^|\/)electron-builder\.(ts|ya?ml|json)$/, reason: 'Build-Konfiguration' },
  { pattern: /\.(ts|tsx|mts|cts)$/, reason: 'TypeScript-Quelle' },
  { pattern: /\.map$/, reason: 'Source Map' },
  { pattern: /(^|\/)\.env(\.|$)/, reason: 'Umgebungsdatei' },
  { pattern: /\.(pfx|p12|pem|key)$/i, reason: 'Schlüssel oder Zertifikat' },
];

// Paketname eines Pfads unter node_modules (inkl. @scope), sonst null
function packageNameOf(file: string): string | null {
  const parts = file.split('/');
  const i = parts.lastIndexOf('node_modules');
  if (i < 0 || i + 1 >= parts.length) return null;
  const first = parts[i + 1]!;
  return first.startsWith('@') ? `${first}/${parts[i + 2] ?? ''}` : first;
}

export function checkAppFiles(
  files: readonly AsarFile[],
  packages: { production: ReadonlySet<string>; devOnly: ReadonlySet<string> },
): string[] {
  const problems: string[] = [];
  const paths = new Set(files.map((f) => f.path));
  for (const required of REQUIRED_APP_FILES) {
    if (!paths.has(required)) problems.push(`Fehlt im Paket: ${required}`);
  }
  const foreign = new Set<string>();
  for (const f of files) {
    const hit = FORBIDDEN.find((rule) => rule.pattern.test(f.path));
    if (hit) problems.push(`Gehört nicht ins Paket (${hit.reason}): ${f.path}`);
    // Ausserhalb der Abhängigkeiten nur der gebaute Code und package.json
    const pkg = packageNameOf(f.path);
    if (pkg === null && !f.path.startsWith('out/') && f.path !== 'package.json') {
      problems.push(`Unerwartete Datei im Paket: ${f.path}`);
    }
    if (pkg !== null && (packages.devOnly.has(pkg) || !packages.production.has(pkg))) foreign.add(pkg);
    // Keine nativen Module (ADR 0001) → nichts darf ausgepackt neben app.asar liegen
    if (f.unpacked) problems.push(`Ausgepackt statt in app.asar: ${f.path}`);
  }
  for (const pkg of foreign) problems.push(`Keine Laufzeitabhängigkeit, aber im Paket: ${pkg}`);
  return problems;
}

// Alle Pakete, die zur Laufzeit gebraucht werden: dependencies samt ihren
// Abhängigkeiten (aufgelöst wie Node: zuerst verschachtelt, dann hochgezogen)
export function productionPackages(projectDir: string): { production: Set<string>; devOnly: Set<string> } {
  type Manifest = {
    dependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const read = (file: string) => JSON.parse(readFileSync(file, 'utf8')) as Manifest;
  const root = read(path.join(projectDir, 'package.json'));
  const top = path.resolve(projectDir);
  // Wie Node: im eigenen node_modules suchen, dann in den Ordnern darüber
  const resolveFrom = (name: string, fromDir: string): string | null => {
    for (let dir = path.resolve(fromDir); ; dir = path.dirname(dir)) {
      const candidate = path.join(dir, 'node_modules', name, 'package.json');
      if (existsSync(candidate)) return candidate;
      if (dir === top || path.dirname(dir) === dir) return null;
    }
  };
  const production = new Set<string>();
  const seen = new Set<string>();
  const visit = (name: string, fromDir: string) => {
    const found = resolveFrom(name, fromDir);
    if (!found || seen.has(found)) return; // nicht installiert (optional) oder schon gesehen
    seen.add(found);
    production.add(name);
    const m = read(found);
    for (const dep of Object.keys({ ...m.dependencies, ...m.optionalDependencies }))
      visit(dep, path.dirname(found));
  };
  for (const dep of Object.keys({ ...root.dependencies, ...root.optionalDependencies }))
    visit(dep, projectDir);
  const devOnly = new Set(Object.keys(root.devDependencies ?? {}).filter((d) => !production.has(d)));
  return { production, devOnly };
}

// ---------------------------------------------------------------------------
// Rechte von Installer und portabler EXE
// ---------------------------------------------------------------------------

// Windows liest die verlangten Rechte aus dem eingebetteten Manifest. Ohne
// Adminrechte heisst: requestedExecutionLevel level="asInvoker".
export function checkExecutionLevel(exe: Uint8Array, label: string): string[] {
  const text = Buffer.from(exe.buffer, exe.byteOffset, exe.byteLength).toString('latin1');
  const levels = [...text.matchAll(/requestedExecutionLevel\s+level="([A-Za-z]+)"/g)].map((m) => m[1]);
  if (levels.length === 0) return [`${label}: kein Manifest mit requestedExecutionLevel gefunden`];
  const wrong = levels.filter((l) => l !== 'asInvoker');
  return wrong.length ? [`${label} verlangt erhöhte Rechte (${wrong.join(', ')})`] : [];
}

// ---------------------------------------------------------------------------
// Netzwerkprotokoll (Chromium --log-net-log)
// ---------------------------------------------------------------------------

// Ereignisse, die eine Verbindung oder Namensauflösung bedeuten – egal wohin
const CONNECTION_EVENTS = new Set([
  'TCP_CONNECT',
  'TCP_CONNECT_ATTEMPT',
  'UDP_CONNECT',
  'HOST_RESOLVER_MANAGER_REQUEST',
  'HOST_RESOLVER_MANAGER_IPV6_REACHABILITY_CHECK',
  'QUIC_SESSION',
  'SSL_CONNECT',
  'WEB_SOCKET_SEND_REQUEST_HEADERS',
]);

const LOCAL_HOST = /^(localhost|127(\.\d{1,3}){3}|\[?::1\]?)(:\d+)?$/i;

function isLocal(hostOrAddress: string): boolean {
  return LOCAL_HOST.test(hostOrAddress.replace(/^\w+:\/\//, '').replace(/\/.*$/, ''));
}

// Netzwerkprotokolle eines abgebrochenen Programms enden ohne «]}»
function parseNetLog(text: string): {
  constants?: { logEventTypes?: Record<string, number> };
  events?: { type: number; params?: unknown }[];
} {
  try {
    return JSON.parse(text);
  } catch {
    const trimmed = text.trimEnd().replace(/,$/, '');
    return JSON.parse(`${trimmed}]}`);
  }
}

// Alle Verbindungen ins Netz laut Chromium-Netzwerkprotokoll. Leer = offline.
// Erfasst auch Anfragen des Browser-Prozesses selbst (z. B. Wörterbuch-Download),
// die an session.webRequest vorbeigehen.
export function externalNetworkActivity(netLogText: string): string[] {
  const log = parseNetLog(netLogText);
  const names = new Map(Object.entries(log.constants?.logEventTypes ?? {}).map(([k, v]) => [v, k]));
  const found = new Set<string>();
  for (const event of log.events ?? []) {
    const name = names.get(event.type) ?? String(event.type);
    const params = JSON.stringify(event.params ?? {});
    for (const m of params.matchAll(/\b(https?|wss?|ftp):\/\/([^/"\s\\]+)/gi)) {
      if (!isLocal(m[2]!)) found.add(`${name}: ${m[1]!.toLowerCase()}://${m[2]}`);
    }
    if (CONNECTION_EVENTS.has(name)) {
      const p = (event.params ?? {}) as Record<string, unknown>;
      const list = Array.isArray(p['address_list']) ? p['address_list'] : [];
      const targets = [p['host'], p['address'], p['remote_address'], p['url'], ...list].filter(
        (v): v is string => typeof v === 'string',
      );
      // Ende-Ereignisse ohne Angaben gehören zu einem Anfang, der schon zählt
      if (targets.length === 0 && Object.keys(p).length > 0) found.add(`${name}: ${params.slice(0, 120)}`);
      for (const t of targets) if (!isLocal(t)) found.add(`${name}: ${t}`);
    }
  }
  return [...found];
}
