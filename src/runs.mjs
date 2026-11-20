// Copyright © NCode Group
// SPDX-License-Identifier: Apache-2.0

// The folders scripts/site.mjs runs Astro in (ADR-1017). Each command gets one under .runs/, a small Astro
// project around the mounted content, so one checkout builds several sites at once. It is removed when its
// command ends, and the next run removes one whose process is gone. A build or preview locks its output folder.
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runsDirectory, toolchainRoot } from './library.mjs';

export const isRunning = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process exists and belongs to someone else.
    return error.code === 'EPERM';
  }
};

// Windows can hold a file for a moment after its process exits, so the removal retries.
const remove = (path) => {
  try {
    rmSync(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // Reported below.
  }
  if (existsSync(path)) console.warn(`Could not remove ${path}: the next command removes it once its process is gone.`);
};

/**
 * Removes the folders and locks that a process that is gone left in .runs/. Every other entry stays,
 * and so does a lock that does not parse.
 */
export function removeStaleRuns() {
  if (!existsSync(runsDirectory)) return;
  for (const entry of readdirSync(runsDirectory, { withFileTypes: true })) {
    const path = join(runsDirectory, entry.name);
    const folder = /^(\d+)-/.exec(entry.name);
    if (entry.isDirectory() && folder) {
      if (!isRunning(Number(folder[1]))) remove(path);
    } else if (entry.isFile() && /^out-[0-9a-f]{16}\.lock$/.test(entry.name)) {
      let pid;
      try {
        pid = Number(JSON.parse(readFileSync(path, 'utf8')).pid);
      } catch {
        continue;
      }
      if (Number.isInteger(pid) && !isRunning(pid)) remove(path);
    }
  }
}

const reExport = (what, file) =>
  `export ${what} from ${JSON.stringify(pathToFileURL(join(toolchainRoot, file)).href)};\n`;

/**
 * Makes the folder for one command and removes it when the process ends. Expressive Code reads its
 * configuration from Astro's root, Astro reads the content collections from `<root>/src/`, and Starlight
 * finds its UI strings by their path under the root, so the folder holds those three.
 * @returns {string} The run's folder.
 */
export function startRun() {
  removeStaleRuns();
  mkdirSync(runsDirectory, { recursive: true });
  const run = mkdtempSync(join(runsDirectory, `${process.pid}-`));
  process.on('exit', () => remove(run));
  writeFileSync(join(run, 'ec.config.mjs'), reExport('{ default }', 'ec.config.mjs'));
  mkdirSync(join(run, 'src'), { recursive: true });
  writeFileSync(join(run, 'src', 'content.config.ts'), reExport('{ collections }', join('src', 'content.config.ts')));
  cpSync(join(toolchainRoot, 'src', 'content', 'i18n'), join(run, 'src', 'content', 'i18n'), { recursive: true });
  return run;
}

/**
 * The lock file of an output folder. Windows and macOS file systems ignore case, so the path is lower-cased
 * there and both spellings of a folder share one lock.
 */
export function outputLock(out) {
  const caseless = process.platform === 'win32' || process.platform === 'darwin';
  const hash = createHash('sha256')
    .update(caseless ? out.toLowerCase() : out)
    .digest('hex')
    .slice(0, 16);
  return join(runsDirectory, `out-${hash}.lock`);
}

/**
 * Takes an output folder for one library until the process ends. Two commands that write one folder conflict,
 * so a second one stops here and says who holds it. A lock whose process is gone is taken over. A lock that cannot
 * be read stops the command and stays, as `removeStaleRuns` keeps it.
 */
export function lockOutput(out, library) {
  const file = outputLock(out);
  const mine = JSON.stringify({ pid: process.pid, library, out });
  mkdirSync(dirname(file), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      writeFileSync(file, mine, { flag: 'wx' });
      process.on('exit', () => {
        try {
          if (readFileSync(file, 'utf8') === mine) rmSync(file);
        } catch {
          // Already gone.
        }
      });
      return;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let held;
      let released = false;
      for (let read = 0; read < 20 && !held; read++) {
        // The first command writes its lock just after it creates it, so an empty lock is read again before it
        // counts as unreadable.
        if (read) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
        try {
          held = JSON.parse(readFileSync(file, 'utf8'));
        } catch (readError) {
          held = undefined;
          if (readError.code === 'ENOENT') {
            released = true;
            break;
          }
        }
      }
      // The command that held it ended while this one read it, so the folder is free.
      if (released) continue;
      if (!held) {
        throw new Error(
          `Cannot read ${file}, the lock of ${out}.\n` +
            'If no command writes the site there, remove that file and run this command again.',
        );
      }
      if (isRunning(held.pid)) {
        throw new Error(
          `Another command writes the site to ${out}: process ${held.pid} is building ${held.library}.\n` +
            'Two commands never write one output folder: wait for that command, stop it, or name another folder with --out.',
        );
      }
      rmSync(file, { force: true });
    }
  }
  throw new Error(`Could not take ${file}`);
}
