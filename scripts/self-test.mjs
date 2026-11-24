// Selbsttest von aussen (AJ-16): startet das Programm zweimal – «create» und
// danach «reopen» (Neustart mit denselben Daten) –, jeweils mit dem
// Netzwerkprotokoll von Chromium (--log-net-log), und prüft die Berichte des
// Programms (src/main/self-test.ts) sowie, dass keine Verbindung ins Netz
// aufgebaut wurde.
//
//   node scripts/self-test.mjs <Programm> [--app <Ordner>] [--dir <Arbeitsordner>] [--phases create,reopen]
//
// Beispiele:
//   node scripts/self-test.mjs dist/win-unpacked/Lernjournal.exe --phases fuses,create,reopen
//   node scripts/self-test.mjs dist/Lernjournal-Portable-0.1.0.exe --phases create
//   node scripts/self-test.mjs node_modules/.bin/electron --app .         (gebaute Entwicklungs-App)
// Unter Linux als root zusätzlich E2E_EXTRA_ARGS=--no-sandbox (wie die E2E-Tests).
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { externalNetworkActivity } from './package-checks.ts';

const PHASES = ['fuses', 'bridge', 'create', 'reopen'];
const ENV_BY_PHASE = { fuses: '1', bridge: '1', create: 'create', reopen: 'reopen' };

// Phase «fuses» (nur gepacktes Programm): Versucht, die EXE als Node.js zu
// missbrauchen (ELECTRON_RUN_AS_NODE, NODE_OPTIONS, --inspect). Mit den Fuses aus
// electron-builder.ts startet stattdessen das normale Programm (Rauchtest der
// Brücke) – keine Markierungsdatei, kein Debugger.
function fuseAttack(dir) {
  const runAsNode = path.join(dir, 'RUN_AS_NODE_AKTIV');
  const nodeOptions = path.join(dir, 'NODE_OPTIONS_AKTIV');
  const preload = path.join(dir, 'node-options.cjs');
  writeFileSync(preload, `require('node:fs').writeFileSync(${JSON.stringify(nodeOptions)}, 'x');\n`);
  return {
    args: [
      '-e',
      `require('node:fs').writeFileSync(${JSON.stringify(runAsNode)}, 'x')`,
      '--inspect=127.0.0.1:0',
    ],
    env: { ELECTRON_RUN_AS_NODE: '1', NODE_OPTIONS: `--require "${preload}"` },
    check: (output) => [
      ...(existsSync(runAsNode) ? ['ELECTRON_RUN_AS_NODE wirkt (Fuse RunAsNode nicht aus)'] : []),
      ...(existsSync(nodeOptions)
        ? ['NODE_OPTIONS wirkt (Fuse EnableNodeOptionsEnvironmentVariable nicht aus)']
        : []),
      ...(/Debugger listening/i.test(output)
        ? ['--inspect wirkt (Fuse EnableNodeCliInspectArguments nicht aus)']
        : []),
    ],
  };
}

function runProgram(exe, args, env, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(exe, args, { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: false });
    let output = '';
    child.stdout.on('data', (d) => (output += d));
    child.stderr.on('data', (d) => (output += d));
    const timer = setTimeout(() => {
      output += `\n[selbsttest] Zeitlimit ${timeoutMs / 1000} s überschritten – Programm wird beendet\n`;
      child.kill();
    }, timeoutMs);
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ code: -1, output: `${output}\n${err.message}` });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, output });
    });
  });
}

// Führt die Phasen nacheinander aus; liefert je Phase Exitcode, Bericht und Netzwerkbefund
export async function runSelfTest({
  exe,
  app,
  dir,
  phases = ['create', 'reopen'],
  timeoutMs = 180_000,
  netLog = true,
}) {
  mkdirSync(dir, { recursive: true });
  const extraArgs = process.env.E2E_EXTRA_ARGS ? process.env.E2E_EXTRA_ARGS.split(' ').filter(Boolean) : [];
  const results = [];
  for (const phase of phases) {
    if (!PHASES.includes(phase)) throw new Error(`Unbekannte Phase ${phase}`);
    // «fuses» in einem eigenen Unterordner, damit create/reopen leer beginnen
    const phaseDir = phase === 'fuses' ? path.join(dir, 'fuses') : dir;
    mkdirSync(phaseDir, { recursive: true });
    const attack = phase === 'fuses' ? fuseAttack(phaseDir) : null;
    // Netzwerkprotokoll nicht bei «fuses»: Node.js (falls die Fuse versagt)
    // würde den unbekannten Schalter ablehnen, bevor der Angriff läuft
    const netLogFile = netLog && !attack ? path.join(dir, `netzwerk-${phase}.json`) : null;
    const args = [
      ...extraArgs,
      ...(app ? [app] : []),
      ...(attack?.args ?? []),
      ...(netLogFile ? [`--log-net-log=${netLogFile}`] : []),
    ];
    const env = {
      ...process.env,
      LERNJOURNAL_SMOKE_TEST: ENV_BY_PHASE[phase],
      LERNJOURNAL_SMOKE_DIR: phaseDir,
    };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.NODE_OPTIONS;
    Object.assign(env, attack?.env);
    const { code, output } = await runProgram(exe, args, env, timeoutMs);
    const problems = [...(attack?.check(output) ?? [])];
    if (code !== 0) problems.push(`Exitcode ${code}`);
    const reportPath = path.join(
      phaseDir,
      `selbsttest-${ENV_BY_PHASE[phase] === '1' ? 'bridge' : phase}.json`,
    );
    let report = null;
    if (existsSync(reportPath)) {
      report = JSON.parse(readFileSync(reportPath, 'utf8'));
      if (!report.pass) problems.push(...report.problems);
    } else problems.push('Kein Bericht geschrieben');
    let network = [];
    if (netLogFile) {
      if (existsSync(netLogFile)) {
        network = externalNetworkActivity(readFileSync(netLogFile, 'utf8'));
        problems.push(...network.map((n) => `Netzwerk: ${n}`));
      } else problems.push('Netzwerkprotokoll fehlt');
    }
    results.push({ phase, code, problems, report, network, output });
  }
  const pass = results.every((r) => r.problems.length === 0);
  writeFileSync(
    path.join(dir, 'selbsttest-ergebnis.json'),
    JSON.stringify({ pass, results: results.map(({ output: _output, ...r }) => r) }, null, 2),
  );
  return { pass, results };
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      app: { type: 'string' },
      dir: { type: 'string' },
      phases: { type: 'string', default: 'create,reopen' },
      'timeout-s': { type: 'string', default: '180' },
    },
  });
  const exe = positionals[0];
  if (!exe) {
    console.error(
      'Aufruf: node scripts/self-test.mjs <Programm> [--app <Ordner>] [--dir <Arbeitsordner>] [--phases …]',
    );
    process.exit(2);
  }
  const dir = path.resolve(values.dir ?? mkdtempSync(path.join(tmpdir(), 'lj-selbsttest-')));
  if (existsSync(dir) && readdirSync(dir).length > 0) {
    console.error(`Arbeitsordner ist nicht leer: ${dir}`);
    process.exit(2);
  }
  const { pass, results } = await runSelfTest({
    exe: path.resolve(exe),
    app: values.app,
    dir,
    phases: values.phases.split(',').map((p) => p.trim()),
    timeoutMs: Number(values['timeout-s']) * 1000,
  });
  for (const r of results) {
    console.log(`${r.problems.length ? 'FEHLER' : 'OK    '} ${r.phase}`);
    for (const p of r.problems) console.log(`         ${p}`);
    if (r.report?.spellcheck?.length)
      console.log(`         Rechtschreibprüfung: ${r.report.spellcheck.join(', ')}`);
    if (r.problems.length) console.log(r.output);
  }
  console.log(`Arbeitsordner: ${dir}`);
  process.exit(pass ? 0 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
