'use strict';

var path = require('path');

var baseDir = path.resolve(__dirname, '../');

var isWin = /^win/.test(process.platform);

// Skip running this if we are running on a windows system
if (isWin) {
  process.stderr.write('Skipping run because we are on windows\n');
  process.exit(0);
}

var childProcess = require('child_process');
console.log("LD_LIBRARY_PATH: " + process.env.LD_LIBRARY_PATH);

try {
  childProcess.execSync('./configure', {
    cwd: baseDir,
    stdio: [0,1,2]
  });
  process.exit(0);
} catch (e) {
  process.stderr.write(e.message + '\n');
  process.exit(1);
}
