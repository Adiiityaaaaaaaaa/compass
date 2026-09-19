'use strict';
const spawn = require('cross-spawn');

// This just runs `npm run webpack serve -- --mode development` with
// HADRON_DISTRIBUTION defaulted to 'compass' when not already set. It's a
// separate script (rather than inlining this in the "start" package.json
// script with `HADRON_DISTRIBUTION=${HADRON_DISTRIBUTION:-compass} ...`)
// because that shell syntax for defaulting an env var only exists in
// POSIX shells; cmd.exe on Windows has no equivalent and fails to parse it.
process.env.HADRON_DISTRIBUTION ??= 'compass';

const child = spawn(
  'npm',
  ['run', 'webpack', 'serve', '--', '--mode', 'development'],
  {
    stdio: 'inherit',
    env: process.env,
  }
);

child.on('exit', (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
