// Electron-Hauptprozess des Spikes. Kein Fenster: führt nur die Checks aus,
// schreibt einen JSON-Bericht und beendet sich mit Exitcode 0 (ok) oder 1.
//
// Bericht landet in:  <Benutzerdaten>/aj00a-report.json
//   Windows: %APPDATA%\aj-00a-sqlite\aj00a-report.json
// Zusätzlich auf stdout, damit CI ihn im Log zeigt.
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { app, utilityProcess } = require('electron');
const { runAll } = require('./src/db-checks');

// Adapter: Electron utilityProcess statt child_process.fork.
// Wichtig: utilityProcess funktioniert auch, wenn die Fuse «RunAsNode»
// abgeschaltet ist (SPEC verlangt das) – child_process.fork mit
// ELECTRON_RUN_AS_NODE würde dann nicht mehr gehen.
function spawnWriter(file) {
  const child = utilityProcess.fork(path.join(__dirname, 'src', 'crash-writer.js'), [file], {
    stdio: 'ignore',
  });
  return {
    onMessage: (cb) => child.on('message', cb),
    onExit: (cb) => child.on('exit', cb),
    kill: () => child.kill(),
  };
}

app.whenReady().then(async () => {
  const workDir = path.join(app.getPath('temp'), 'aj00a-electron');
  const report = await runAll({ workDir, spawnWriter });
  report.packaged = app.isPackaged;
  const out = path.join(app.getPath('userData'), 'aj00a-report.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  app.exit(report.allOk ? 0 : 1);
});
