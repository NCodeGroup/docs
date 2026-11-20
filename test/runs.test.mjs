// Copyright © NCode Group
// SPDX-License-Identifier: Apache-2.0

// The run folders and output locks of the site script.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { pathToFileURL } from 'node:url';
import { runsDirectory, toolchainRoot } from '../src/library.mjs';
import { lockOutput, outputLock, removeStaleRuns, startRun } from '../src/runs.mjs';
import { work } from './helpers.mjs';

const GONE = 2 ** 30;
const cleanup = [];
const remember = (...paths) => cleanup.push(...paths);

describe('a run of the site script', () => {
  afterEach(() => {
    for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true });
  });

  it('makes a folder for each run that holds the toolchain files Astro reads from its root', () => {
    const first = startRun();
    const second = startRun();
    remember(first, second);
    assert.notEqual(first, second);
    for (const run of [first, second]) {
      assert.equal(join(run, '..'), runsDirectory);
      assert.ok(run.startsWith(join(runsDirectory, `${process.pid}-`)));
    }
    assert.equal(
      readFileSync(join(first, 'ec.config.mjs'), 'utf8'),
      `export { default } from ${JSON.stringify(pathToFileURL(join(toolchainRoot, 'ec.config.mjs')).href)};\n`,
    );
    assert.equal(
      readFileSync(join(first, 'src', 'content.config.ts'), 'utf8'),
      `export { collections } from ${JSON.stringify(pathToFileURL(join(toolchainRoot, 'src', 'content.config.ts')).href)};\n`,
    );
    assert.equal(
      readFileSync(join(first, 'src', 'content', 'i18n', 'en.json'), 'utf8'),
      readFileSync(join(toolchainRoot, 'src', 'content', 'i18n', 'en.json'), 'utf8'),
    );
  });

  it('removes the folders and locks of processes that are gone and keeps every other entry', () => {
    mkdirSync(runsDirectory, { recursive: true });
    const stale = join(runsDirectory, `${GONE}-stale`);
    const staleLock = join(runsDirectory, 'out-0000000000000000.lock');
    const alive = join(runsDirectory, `${process.pid}-alive`);
    const other = join(runsDirectory, 'other');
    const aliveLock = join(runsDirectory, 'out-1111111111111111.lock');
    remember(stale, staleLock, alive, other, aliveLock);
    for (const folder of [stale, alive, other]) mkdirSync(folder, { recursive: true });
    writeFileSync(staleLock, JSON.stringify({ pid: GONE }));
    writeFileSync(aliveLock, JSON.stringify({ pid: process.pid }));
    removeStaleRuns();
    assert.equal(existsSync(stale), false);
    assert.equal(existsSync(staleLock), false);
    assert.equal(existsSync(alive), true);
    assert.equal(existsSync(other), true);
    assert.equal(existsSync(aliveLock), true);
  });

  it('stops a second command that writes an output folder another process holds', () => {
    const out = join(work, 'locked-out');
    const file = outputLock(out);
    mkdirSync(runsDirectory, { recursive: true });
    remember(file);
    writeFileSync(file, JSON.stringify({ pid: process.pid, library: '/somewhere/Other', out }));
    assert.throws(
      () => lockOutput(out, '/somewhere/Mine'),
      new Error(
        `Another command writes the site to ${out}: process ${process.pid} is building /somewhere/Other.\n` +
          'Two commands never write one output folder: wait for that command, stop it, or name another folder with --out.',
      ),
    );
  });

  it('takes over the lock of a process that is gone', () => {
    const out = join(work, 'taken-over-out');
    const file = outputLock(out);
    mkdirSync(runsDirectory, { recursive: true });
    remember(file);
    writeFileSync(file, JSON.stringify({ pid: GONE, library: '/somewhere/Gone', out }));
    lockOutput(out, '/somewhere/Mine');
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).pid, process.pid);
  });

  it('locks one file for the spellings of a folder that its file system treats as one', () => {
    const caseless = process.platform === 'win32' || process.platform === 'darwin';
    const upper = outputLock(join(work, 'Out'));
    const lower = outputLock(join(work, 'out'));
    if (caseless) assert.equal(upper, lower);
    else assert.notEqual(upper, lower);
    assert.notEqual(outputLock(join(work, 'one')), outputLock(join(work, 'two')));
  });
});
