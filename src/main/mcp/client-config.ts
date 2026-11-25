// Fertige Einrichtungen für MCP-Clients – damit Lernende nichts abtippen müssen.
//
//  - Claude Desktop: Erweiterung «Lernjournal.mcpb» (ZIP mit manifest.json und
//    der stdio-Brücke). Doppelklick installiert sie in Claude Desktop. Claude
//    Desktop bringt seine eigene Node-Laufzeit mit, es braucht keine Installation.
//    Format: MCP Bundles, https://github.com/modelcontextprotocol/mcpb
//  - Claude Code (Kommandozeile): ein Befehl «claude mcp add …»
//  - VS Code / andere Clients mit HTTP-Unterstützung: JSON-Block mit URL und Header
//
// Adresse und Schlüssel stehen direkt in der Erweiterung bzw. im Befehl. Wer den
// Schlüssel erneuert, muss die Einrichtung deshalb neu übernehmen.
import bridgeSource from './bridge/lernjournal-bridge.mjs?raw';
import { ZipWriter } from '../archive/zip-writer';
import { writeAtomically } from '../fs-atomic';

export const MCP_SERVER_NAME = 'lernjournal';

export type ClientTarget = { endpoint: string; token: string; version: string };

// manifest.json der Erweiterung (MCPB-Manifest 0.3)
export function mcpbManifest({ endpoint, token, version }: ClientTarget) {
  return {
    manifest_version: '0.3',
    name: MCP_SERVER_NAME,
    display_name: 'Lernjournal',
    // Versionsnummer muss SemVer sein; die App-Version passt
    version,
    description:
      'Verbindet Claude mit deinem geöffneten Lernjournal-Projekt (lokal, nur auf diesem Computer).',
    long_description:
      'Claude kann Journale suchen und lesen sowie Textkorrekturen, Verknüpfungen und auf Wunsch neue ' +
      'Entwürfe vorschlagen. Jeder Vorschlag erscheint in Lernjournal unter Einstellungen → MCP und wird ' +
      'erst nach deiner Bestätigung übernommen. Lernjournal muss dafür geöffnet und MCP aktiviert sein.',
    author: { name: 'Samuel Baer' },
    server: {
      type: 'node',
      entry_point: 'server/lernjournal-bridge.mjs',
      mcp_config: {
        command: 'node',
        args: ['${__dirname}/server/lernjournal-bridge.mjs'],
        env: { LERNJOURNAL_MCP_URL: endpoint, LERNJOURNAL_MCP_KEY: token },
      },
    },
    tools: [
      { name: 'journal_search', description: 'Journale suchen oder auflisten' },
      { name: 'journal_read', description: 'Ein Journal lesen' },
      { name: 'journal_propose_edit', description: 'Textkorrektur vorschlagen' },
      { name: 'journal_propose_link', description: 'Verknüpfung vorschlagen' },
      { name: 'journal_propose_draft', description: 'Neuen Entwurf vorschlagen (nur wenn erlaubt)' },
      { name: 'proposal_status', description: 'Status eines Vorschlags abfragen' },
    ],
    compatibility: { platforms: ['win32', 'darwin', 'linux'], runtimes: { node: '>=18.0.0' } },
  };
}

// Erweiterung als Datei schreiben (atomar: nie eine halbe Datei)
export async function writeMcpb(file: string, target: ClientTarget): Promise<void> {
  await writeAtomically(file, async (tmp) => {
    const zip = await ZipWriter.create(tmp);
    const json = (value: unknown) => new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
    try {
      await zip.addBuffer('manifest.json', json(mcpbManifest(target)), { compress: true });
      await zip.addBuffer('server/lernjournal-bridge.mjs', new TextEncoder().encode(bridgeSource), {
        compress: true,
      });
      await zip.close();
    } catch (err) {
      await zip.abort();
      throw err;
    }
  });
}

// Claude Code: ein Befehl für die Eingabeaufforderung / PowerShell
export function claudeCodeCommand({ endpoint, token }: ClientTarget): string {
  return `claude mcp add --transport http ${MCP_SERVER_NAME} ${endpoint} --header "Authorization: Bearer ${token}"`;
}

// VS Code (.vscode/mcp.json oder Benutzer-Einstellung «MCP: Open User Configuration»)
// und Clients mit gleichem Aufbau (Cursor, LM Studio …)
export function httpClientJson({ endpoint, token }: ClientTarget): string {
  return JSON.stringify(
    {
      servers: {
        [MCP_SERVER_NAME]: { type: 'http', url: endpoint, headers: { Authorization: `Bearer ${token}` } },
      },
    },
    null,
    2,
  );
}
