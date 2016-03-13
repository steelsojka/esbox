#!/usr/bin/env node

import cc from 'cli-color';
import execa from 'execa';
import meow from 'meow';
import path from 'path';
import pathExists from 'path-exists';
import { clearScreen } from 'ansi-escapes';
import { debounce } from 'lodash';
import { tick, cross } from 'figures';

const box = /^darwin/.test(process.platform) ? '📦 ' : 'esbox';

const red = cc.red;
const black = cc.black;
const bgWhite = cc.xtermSupported ? cc.bgXterm(250) : cc.bgWhite;
const brown = cc.xtermSupported ? cc.xterm(137) : cc.yellow;
const grey = cc.xtermSupported ? cc.xterm(241) : cc.blackBright;

const help = `
  ${bgWhite('                       ')}
  ${bgWhite(`  📦  ${black('ES2016 in a box')}   `)}
  ${bgWhite(`     ${grey('git.io/esbox')}      `)}
  ${bgWhite('                       ')}

  ${brown('usage')}
    ${grey('>')} esbox ${grey('FILENAME')}

  ${brown('flags')}
    --cwd=${grey('DIRECTORY')}   run in a different directory
    --no-watch        only run your script once
    --no-clear        disable clearing the display before each run
    --version         show esbox version`;

// get input from command line (and automate --help etc)
const { input, flags } = meow(
  {
    help,
    description: false,
  },
  {
    default: {
      cwd: null,
      clear: true,
      watch: true,
    },
    string: ['cwd'],
    boolean: ['clear', 'watch'],
    alias: {
      v: 'version',
    },
  }
);

// if called with no arguments, treat the same as --help
if (!input.length) {
  console.log(help);
  process.exit(0);
}

// assert there's only one argument
if (input.length > 1) {
  console.log(help);
  console.error(red('Cannot run esbox with more than one file argument.'));
  process.exit(1);
}

// unpack flags
const { clear, watch } = flags;
const cwd = flags.cwd ?
  path.resolve(flags.cwd) :
  process.cwd();

// determine the real path to the user's script
const userScript = (() => {
  let name = path.resolve(cwd, input[0]);

  // add .js extension if necessary
  if (!pathExists.sync(name)) name = `${name}.js`;

  // give up if not found
  if (!pathExists.sync(name)) {
    console.error(red(`Not found: ${input[0]}`));
    process.exit(1);
  }
  return name;
})();


// function to clear the display and run the user's script
const run = (() => {
  const runner = path.resolve(__dirname, 'run.js');

  let childProcess;

  return debounce(() => {
    if (clear) process.stdout.write(clearScreen);

    console.log(brown(`${box} ${path.relative(process.cwd(), userScript)}\n`));

    if (childProcess) childProcess.kill();

    childProcess = execa.spawn('node', [
      runner,
      '--file', userScript,
      '--clear', clear,
    ], { cwd, stdio: 'inherit' });

    childProcess.on('close', code => {
      if (code !== null && code !== 143) {
        const symbol = brown(code === 0 ? tick : cross);

        console.log(`\n${symbol}`, brown(`exited with code ${code}`));
        if (!clear) console.log();
      }
    });

    return;
  }, 10, { maxWait: 1000 });
})();

// start up
if (watch) {
  const sane = require('sane');

  const onFileEvent = (name, root) => {
    if (!/\.js$/.test(name)) return;

    delete require.cache[path.resolve(root, name)];

    run();
  };

  const watcher = sane(cwd);

  watcher.on('add', onFileEvent);
  watcher.on('change', onFileEvent);
  watcher.on('delete', onFileEvent);

  watcher.on('ready', run);
}
else run();
