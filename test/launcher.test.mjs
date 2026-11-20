// Copyright © NCode Group
// SPDX-License-Identifier: Apache-2.0

// The launcher a library copies into its build/ folder finds the toolchain beside the library's main checkout from
// any worktree, takes one named by --toolchain or DOCS_TOOLCHAIN, and passes the library and the options on.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fixture, root, work } from './helpers.mjs';

describe('the launcher a library copies', () => {
  const area = join(work, 'launcher');
  rmSync(area, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });

  // Stand-ins for scripts/site.mjs that print what they were given instead of building.
  const standIn = (folder, extra) => {
    mkdirSync(join(folder, 'scripts'), { recursive: true });
    writeFileSync(
      join(folder, 'scripts', 'site.mjs'),
      `console.log(JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd()${extra} })); process.exit(3);\n`,
    );
  };
  const docs = join(area, 'docs');
  const other = join(area, 'other');
  standIn(docs, '');
  standIn(other, ', other: true');

  const library = join(area, 'Lib');
  mkdirSync(join(library, 'build'), { recursive: true });
  copyFileSync(join(fixture, 'build', 'site.mjs'), join(library, 'build', 'site.mjs'));
  const git = (...args) => {
    const result = spawnSync(
      'git',
      ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', '-c', 'commit.gpgsign=false', ...args],
      { cwd: library, encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);
  };
  git('init', '--quiet');
  git('add', '--all');
  git('commit', '--quiet', '--message', 'The library');
  git('worktree', 'add', '--quiet', '-b', 'plan', '.claude/worktrees/plan');
  const worktree = join(library, '.claude', 'worktrees', 'plan');

  const run = (launcher, args, cwd, env = {}) => {
    const environment = { ...process.env };
    // A toolchain or a folder npm started from in the environment of whoever runs the tests is not the tests' input.
    for (const key of ['DOCS_TOOLCHAIN', 'INIT_CWD']) delete environment[key];
    return spawnSync(process.execPath, [launcher, ...args], {
      cwd,
      env: { ...environment, ...env },
      encoding: 'utf8',
      timeout: 180_000,
    });
  };
  const launcherIn = (folder) => join(folder, 'build', 'site.mjs');
  const printed = (result) => JSON.parse(result.stdout);

  it('runs the toolchain beside the main checkout for the worktree it is in', () => {
    const result = run(launcherIn(worktree), ['build', '--out', '../out'], worktree);
    assert.equal(result.status, 3, result.stderr);
    const { args, cwd } = printed(result);
    assert.deepEqual(
      args.map((arg, index) => (index === 1 ? resolve(arg) : arg)),
      ['build', resolve(worktree), '--out', '../out'],
    );
    assert.equal(resolve(cwd), resolve(worktree));
  });

  it('runs it for the main checkout as well', () => {
    const result = run(launcherIn(library), ['dev'], library);
    assert.equal(result.status, 3, result.stderr);
    const { args } = printed(result);
    assert.equal(args[0], 'dev');
    assert.equal(resolve(args[1]), resolve(library));
  });

  it('takes the toolchain from --toolchain, then from DOCS_TOOLCHAIN', () => {
    const launcher = launcherIn(library);
    const argsOf = (result) => {
      assert.equal(result.status, 3, result.stderr);
      const { args, other: isOther } = printed(result);
      assert.equal(isOther, true, 'the other toolchain should have run');
      return args.map((arg, index) => (index === 1 ? resolve(arg) : arg));
    };
    assert.deepEqual(argsOf(run(launcher, ['dev', '--toolchain', other, '--port', '4400'], library)), [
      'dev',
      resolve(library),
      '--port',
      '4400',
    ]);
    assert.deepEqual(argsOf(run(launcher, ['dev', `--toolchain=${other}`], library)), ['dev', resolve(library)]);
    assert.deepEqual(argsOf(run(launcher, ['dev'], library, { DOCS_TOOLCHAIN: other })), ['dev', resolve(library)]);

    const named = run(launcher, ['dev', '--toolchain', docs], library, { DOCS_TOOLCHAIN: other });
    assert.equal(named.status, 3, named.stderr);
    assert.equal(printed(named).other, undefined, 'the variable should not win over --toolchain');
  });

  it('says where it looked when no toolchain is there', () => {
    const nowhere = join(area, 'nowhere');
    const result = run(launcherIn(library), ['build', '--toolchain', nowhere], library);
    assert.equal(result.status, 1, result.stdout);
    assert.ok(result.stderr.includes(`No NCodeGroup/docs toolchain at ${resolve(nowhere)}`), result.stderr);
    assert.ok(result.stderr.includes('--toolchain <folder>'), result.stderr);
  });

  it('builds the fixture with this toolchain', () => {
    const out = join(work, 'out', 'launcher');
    rmSync(out, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    const result = run(join(fixture, 'build', 'site.mjs'), ['build', '--toolchain', root, '--out', out], root);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.ok(existsSync(join(out, 'index.html')), 'index.html should be written');
  });
});
