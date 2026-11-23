// Startet die Checks mit normalem Node.js:  node src/run-node.js
'use strict';

const path = require('node:path');
const os = require('node:os');
const { fork } = require('node:child_process');
const { runAll } = require('./db-checks');

// Adapter: child_process.fork in die einheitliche Schnittstelle verpacken.
function spawnWriter(file) {
  const child = fork(path.join(__dirname, 'crash-writer.js'), [file], { stdio: 'ignore' });
  return {
    onMessage: (cb) => child.on('message', cb),
    onExit: (cb) => child.on('exit', cb),
    kill: () => child.kill('SIGKILL'),
  };
}

runAll({ workDir: path.join(os.tmpdir(), 'aj00a-node'), spawnWriter }).then((report) => {
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.allOk ? 0 : 1);
});
