// Lernjournal-Brücke für Claude Desktop (stdio ↔ lokales Streamable HTTP)
//
// Warum es diese Datei gibt:
//   Claude Desktop startet lokale MCP-Server nur als Programm, mit dem es über
//   stdin/stdout spricht (stdio). «Benutzerdefinierte Konnektoren» mit einer URL
//   verbindet Claude dagegen aus der Anthropic-Cloud – die erreicht 127.0.0.1 auf
//   dem Computer der Lernenden nie. Lernjournal selbst bietet MCP aber als
//   lokalen HTTP-Dienst im laufenden Programm an (ADR 0011).
//   Diese Brücke verbindet beides: Claude Desktop startet sie (mit seiner
//   eingebauten Node-Laufzeit, die Lernenden müssen nichts installieren), sie
//   liest JSON-RPC-Nachrichten zeilenweise von stdin und leitet sie per POST an
//   Lernjournal weiter. Die Antworten schreibt sie zeilenweise nach stdout.
//
// Lernjournal geschlossen oder MCP nicht aktiv?
//   Dann antwortet die Brücke selbst: Claude startet trotzdem fehlerfrei und
//   sieht ein Werkzeug «lernjournal_verbindung», das erklärt, was zu tun ist.
//   Alle paar Sekunden prüft die Brücke erneut. Sobald Lernjournal erreichbar
//   ist, meldet sie «tools/list_changed» – Claude lädt dann die echten Werkzeuge.
//
// Nur Node-Bordmittel (kein npm-Paket): Die Datei wird unverändert in die
// Erweiterung (.mcpb) gepackt. Konfiguration über Umgebungsvariablen, die das
// Manifest der Erweiterung setzt:
//   LERNJOURNAL_MCP_URL      Adresse, z. B. http://127.0.0.1:47651/mcp
//   LERNJOURNAL_MCP_KEY      Zugangsschlüssel (Bearer-Token)
//   LERNJOURNAL_MCP_POLL_MS  Prüfintervall im Offline-Fall (nur für Tests kürzer)
import { createInterface } from 'node:readline';

const URL_ = process.env.LERNJOURNAL_MCP_URL || 'http://127.0.0.1:47651/mcp';
const KEY = process.env.LERNJOURNAL_MCP_KEY || '';
const POLL_MS = Number(process.env.LERNJOURNAL_MCP_POLL_MS) || 5000;
const TIMEOUT_MS = 30_000;

// Protokollversionen, die die Brücke im Offline-Fall selbst bestätigen darf
const KNOWN_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const STATUS_TOOL = 'lernjournal_verbindung';

// Zustand der Verbindung zum Programm
let online = null; // null = noch unbekannt, true/false nach erstem Versuch
let lastProblem = 'Lernjournal wurde noch nicht erreicht.';
let protocolVersion = null; // ausgehandelte Version → Header mcp-protocol-version
let clientInitialized = false; // erst danach dürfen Benachrichtigungen an Claude gehen
let pollTimer = null;

// ---- Ausgabe an Claude (stdout, eine JSON-Nachricht pro Zeile) ------------
function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}
function log(text) {
  // stderr landet in den MCP-Protokollen von Claude Desktop – hilfreich zur Fehlersuche
  process.stderr.write(`[lernjournal-bridge] ${text}\n`);
}

// ---- Verständliche Meldungen ----------------------------------------------
const HELP_OFFLINE =
  'Lernjournal ist nicht erreichbar. Öffne Lernjournal und dein Projekt und aktiviere ' +
  'Einstellungen → MCP («MCP für dieses Projekt aktivieren»). Tipp: «Beim Öffnen eines ' +
  'Projekts automatisch aktivieren» einschalten.';
const HELP_KEY =
  'Der Zugangsschlüssel passt nicht (mehr). Speichere in Lernjournal unter Einstellungen → MCP ' +
  'die Claude-Desktop-Erweiterung neu und installiere sie erneut.';

// ---- Weiterleiten an Lernjournal ------------------------------------------
class Offline extends Error {}

// Eine JSON-RPC-Nachricht an Lernjournal schicken. Gibt die Antwortnachrichten
// zurück (bei Benachrichtigungen meist keine). Wirft Offline, wenn das Programm
// nicht erreichbar ist oder den Zugang verweigert.
async function forward(message) {
  const headers = {
    accept: 'application/json, text/event-stream',
    'content-type': 'application/json',
    authorization: `Bearer ${KEY}`,
  };
  if (protocolVersion) headers['mcp-protocol-version'] = protocolVersion;
  let response;
  try {
    response = await fetch(URL_, {
      method: 'POST',
      headers,
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    // Verbindung abgelehnt (Programm zu, MCP aus) oder Zeitüberschreitung
    throw new Offline(HELP_OFFLINE);
  }
  // 401: falscher Schlüssel · 503: Projekt geschlossen · 404/403: falsche Adresse
  if (response.status === 401) throw new Offline(HELP_KEY);
  if (response.status === 503 || response.status === 404 || response.status === 403)
    throw new Offline(HELP_OFFLINE);
  if (response.status === 202 || response.status === 204) return [];
  const text = await response.text();
  if (!text.trim()) return [];
  // Antwort als JSON oder (je nach Server) als Server-Sent Events
  const type = response.headers.get('content-type') || '';
  const chunks = type.startsWith('text/event-stream')
    ? text
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .filter(Boolean)
    : [text];
  const messages = [];
  for (const chunk of chunks) {
    try {
      const parsed = JSON.parse(chunk);
      if (Array.isArray(parsed)) messages.push(...parsed);
      else messages.push(parsed);
    } catch {
      log(`Antwort nicht lesbar (HTTP ${response.status})`);
    }
  }
  return messages;
}

// ---- Online/Offline verfolgen ---------------------------------------------
function markOnline() {
  const wasOffline = online === false;
  online = true;
  stopPolling();
  // Claude hatte bisher nur das Hinweis-Werkzeug → echte Werkzeuge neu laden lassen
  if (wasOffline && clientInitialized) {
    log('Lernjournal ist jetzt erreichbar.');
    send({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' });
  }
}

function markOffline(problem) {
  if (online !== false) log(problem);
  online = false;
  lastProblem = problem;
  startPolling();
}

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(async () => {
    try {
      // «ping» ist harmlos und zeigt, ob Programm, Projekt und Schlüssel passen
      await forward({ jsonrpc: '2.0', id: 'lernjournal-bridge-check', method: 'ping' });
      markOnline();
    } catch (err) {
      if (err instanceof Offline) lastProblem = err.message;
    }
  }, POLL_MS);
  pollTimer.unref(); // hält den Prozess nicht künstlich am Leben
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

// ---- Ersatzantworten, solange Lernjournal nicht erreichbar ist -------------
function offlineResult(message) {
  const { method, params } = message;
  if (method === 'initialize') {
    const requested = params?.protocolVersion;
    return {
      protocolVersion: KNOWN_VERSIONS.includes(requested) ? requested : KNOWN_VERSIONS[0],
      capabilities: { tools: { listChanged: true } },
      serverInfo: { name: 'Lernjournal', version: 'bridge' },
      instructions: `Lernjournal ist im Moment nicht verbunden. ${HELP_OFFLINE}`,
    };
  }
  if (method === 'ping') return {};
  if (method === 'tools/list') {
    return {
      tools: [
        {
          name: STATUS_TOOL,
          description:
            'Zeigt, warum Lernjournal gerade nicht verbunden ist und wie die Verbindung hergestellt wird.',
          inputSchema: { type: 'object', properties: {} },
          annotations: { readOnlyHint: true, openWorldHint: false },
        },
      ],
    };
  }
  if (method === 'tools/call') {
    return { isError: true, content: [{ type: 'text', text: lastProblem }] };
  }
  if (method === 'resources/list') return { resources: [] };
  if (method === 'prompts/list') return { prompts: [] };
  return null; // unbekannte Methode → JSON-RPC-Fehler
}

// ---- Eine Nachricht von Claude verarbeiten --------------------------------
async function handle(message) {
  const isRequest = message && typeof message === 'object' && 'id' in message && 'method' in message;
  if (message?.method === 'notifications/initialized') clientInitialized = true;
  try {
    const replies = await forward(message);
    markOnline();
    for (const reply of replies) {
      // Ausgehandelte Version für alle weiteren Anfragen merken
      if (isRequest && message.method === 'initialize' && reply?.result?.protocolVersion)
        protocolVersion = reply.result.protocolVersion;
      send(reply);
    }
  } catch (err) {
    if (!(err instanceof Offline)) throw err;
    markOffline(err.message);
    if (!isRequest) return; // Benachrichtigungen brauchen keine Antwort
    const result = offlineResult(message);
    if (message.method === 'initialize' && result) protocolVersion = result.protocolVersion;
    send(
      result
        ? { jsonrpc: '2.0', id: message.id, result }
        : { jsonrpc: '2.0', id: message.id, error: { code: -32000, message: err.message } },
    );
  }
}

// ---- Hauptschleife: stdin zeilenweise lesen --------------------------------
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
let pending = 0; // laufende Weiterleitungen – beim Beenden noch abwarten
let closing = false;
function finishIfDone() {
  if (closing && pending === 0) process.exit(0);
}
lines.on('line', (line) => {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Ungültiges JSON' } });
    return;
  }
  pending++;
  handle(message)
    .catch((err) => {
      log(`Unerwarteter Fehler: ${err?.message ?? err}`);
      if (message && 'id' in message)
        send({
          jsonrpc: '2.0',
          id: message.id,
          error: { code: -32603, message: 'Interner Fehler der Brücke' },
        });
    })
    .finally(() => {
      pending--;
      finishIfDone();
    });
});
// Claude beendet die Verbindung (stdin zu) → offene Antworten fertig schreiben, dann beenden
lines.on('close', () => {
  stopPolling();
  closing = true;
  finishIfDone();
});
log(`gestartet, Ziel ${URL_}`);
