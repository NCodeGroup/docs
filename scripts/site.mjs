#!/usr/bin/env node
// Copyright © NCode Group
// SPDX-License-Identifier: Apache-2.0

// Builds, serves or previews one library's documentation site.
//
//   node scripts/site.mjs <build|dev|preview|prepare> <library folder> [options]
//
//   --content <path>    the content folder inside the library (default docs/site)
//   --site-url <url>    the URL the site is served at, base path included; replaces site.url of the
//                       library's site.config.json (the workflow passes the Pages URL this way)
//   --out <folder>      where the built site goes (default dist/ in this toolchain)
//   --port <number>     the port for dev and preview (default 4321)
//
// The library folder and the content path may also come from DOCS_LIBRARY and DOCS_CONTENT, the site
// URL from SITE_URL and the output folder from DOCS_OUT; an argument wins over its variable.
//
// What it does: checks the library's site.config.json, mounts the content folder into this toolchain
// (a copy at src/content/docs/, see mount() below), and runs Astro with the library named in the
// environment. Nothing is written to the library, and nothing of the library stays in this
// repository: the mount is ignored by git and replaced by the next run.
import { spawn } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  utimesSync,
  watch,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { CONFIG_FILE, lockFile, mountDirectory, mountPath, resolveLibrary, toolchainRoot } from '../src/library.mjs';
import { readSnippets } from '../src/snippets/catalog.mjs';

const COMMANDS = ['build', 'dev', 'preview', 'prepare'];

// CodeQL's js/clear-text-logging flags this console.error, because some problems quote SITE_URL or DOCS_OUT from a copy
// of process.env. They are a URL and a folder the caller passed, never a secret: its alert is a false positive.
function usage(problem) {
  console.error(
    `${problem}\n\nUsage: node scripts/site.mjs <${COMMANDS.join('|')}> <library folder> [--content <path>] [--site-url <url>] [--out <folder>] [--port <number>]`,
  );
  process.exit(2);
}

/**
 * Why Astro cannot build into the folder `out`, or undefined. Astro (getOutDirWithinCwd in
 * astro/dist/core/build/common.js, 7.4.11) takes the output folder for one inside its working
 * folder, the toolchain, when the folder's path starts with the toolchain's as text, and then
 * builds the prerendered pages in `<out>/.prerender`, where they cannot find the toolchain's
 * packages: `../docs-site` beside a toolchain at `../docs` fails with "Cannot find package".
 * Astro's working folder can be the toolchain's real path, which differs from the path this script
 * has where a symbolic link leads to the toolchain, so both are checked.
 */
function outFolderProblem(out) {
  for (const toolchain of new Set(
    [toolchainRoot, realpathSync(toolchainRoot)].map((path) => path.replace(/[\\/]+$/, '')),
  )) {
    const rest = out.slice(toolchain.length);
    if (out.startsWith(toolchain) && rest !== '' && !/^[\\/]/.test(rest)) {
      return `The output folder ${out} is outside the toolchain, but its path starts with the toolchain's, ${toolchain}: Astro takes it for a folder inside the toolchain, and the build then cannot find the toolchain's packages. Name a folder whose path does not start with ${toolchain}.`;
    }
  }
  return undefined;
}

/** Entries of a content folder that are never mounted. */
const skipped = (name) => name === CONFIG_FILE || name === 'node_modules' || name.startsWith('.');

/**
 * Makes `target` a copy of `source`: copies what is new or changed, removes what is gone. A file
 * that did not change is left alone, so the dev server reloads only what an author touched.
 * @returns {number} How many files were copied or removed.
 */
function sync(source, target, top = true) {
  let changes = 0;
  mkdirSync(target, { recursive: true });
  const wanted = new Map();
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (top && skipped(entry.name)) continue;
    if (entry.isDirectory() || entry.isFile()) wanted.set(entry.name, entry);
  }
  for (const entry of readdirSync(target, { withFileTypes: true })) {
    const match = wanted.get(entry.name);
    if (!match || match.isDirectory() !== entry.isDirectory()) {
      rmSync(join(target, entry.name), { recursive: true, force: true });
      changes++;
    }
  }
  for (const [name, entry] of wanted) {
    const from = join(source, name);
    const to = join(target, name);
    if (entry.isDirectory()) {
      changes += sync(from, to, false);
      continue;
    }
    const original = statSync(from);
    const copy = existsSync(to) ? statSync(to) : undefined;
    if (!copy || copy.size !== original.size || Math.abs(copy.mtimeMs - original.mtimeMs) > 1) {
      cpSync(from, to);
      utimesSync(to, original.atime, original.mtime);
      changes++;
    }
  }
  return changes;
}

/**
 * Mounts the library's content folder where Starlight reads pages: a copy, not a link. A page
 * imports packages (`@astrojs/starlight/components`), and the bundler looks for a package upward
 * from the real location of the importing file; under a link that location is the library's
 * repository, which has no node_modules by design. A copy also behaves the same on Windows, where
 * links need a privilege or a junction, and keeps every file the dev server serves inside its root.
 */
function mount(library) {
  return sync(library.contentDirectory, mountDirectory);
}

const isRunning = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process exists and belongs to someone else.
    return error.code === 'EPERM';
  }
};

/**
 * Takes this checkout for one library until the script ends. There is one mount, so a second build
 * started while a first one runs, or under a dev server, would mix two libraries' pages; it stops
 * here instead, and says who holds the checkout. A lock whose process is gone is taken over.
 */
function lock(library) {
  const mine = JSON.stringify({ pid: process.pid, library: library.root });
  mkdirSync(dirname(lockFile), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      writeFileSync(lockFile, mine, { flag: 'wx' });
      process.on('exit', () => {
        try {
          if (readFileSync(lockFile, 'utf8') === mine) rmSync(lockFile);
        } catch {
          // Already gone.
        }
      });
      return;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let held;
      try {
        held = JSON.parse(readFileSync(lockFile, 'utf8'));
      } catch {
        held = undefined;
      }
      if (held && isRunning(held.pid)) {
        console.error(
          `This toolchain checkout is in use: process ${held.pid} is building or serving ${held.library}.\n` +
            "One checkout builds one library at a time, because the library's content is mounted into it. Wait for that command, stop it, or use a second checkout.",
        );
        process.exit(1);
      }
      rmSync(lockFile, { force: true });
    }
  }
  throw new Error(`Could not take ${lockFile}`);
}

function runAstro(args, environment) {
  // Astro's own entry file, run with this Node.js: no shell and no .cmd shim, so it is the same on Windows.
  const astro = join(toolchainRoot, 'node_modules', 'astro', 'bin', 'astro.mjs');
  if (!existsSync(astro)) {
    console.error(`The toolchain's packages are not installed: run "npm ci --ignore-scripts" in ${toolchainRoot}`);
    process.exit(1);
  }
  const child = spawn(process.execPath, [astro, ...args], { cwd: toolchainRoot, env: environment, stdio: 'inherit' });
  // Ending this script ends Astro too, so a server never outlives the command that started it.
  const stop = (signal) => child.kill(signal);
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, stop);
  child.on('exit', () => {
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.off(signal, stop);
  });
  return child;
}

const finished = (child) => new Promise((done) => child.on('exit', (code, signal) => done(code ?? (signal ? 1 : 0))));

async function main() {
  let parsed;
  try {
    parsed = parseArgs({
      allowPositionals: true,
      options: {
        content: { type: 'string' },
        'site-url': { type: 'string' },
        out: { type: 'string' },
        port: { type: 'string' },
      },
    });
  } catch (error) {
    usage(error.message);
  }
  const [command, folder, ...extra] = parsed.positionals;
  if (!COMMANDS.includes(command)) usage(command ? `Unknown command "${command}".` : 'No command given.');
  if (extra.length > 0) usage(`Unexpected argument "${extra[0]}".`);

  // The caller's own folder is where a relative path starts: npm sets INIT_CWD to it, because it
  // runs a script from the package's folder.
  const from = process.env.INIT_CWD || process.cwd();
  const environment = { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' };
  if (folder) {
    // A folder is relative to where the command was typed; "fixture", which the package scripts name,
    // is found in the toolchain from anywhere.
    const typed = resolve(from, folder);
    environment.DOCS_LIBRARY =
      !existsSync(typed) && existsSync(resolve(toolchainRoot, folder)) ? resolve(toolchainRoot, folder) : typed;
  } else if (environment.DOCS_LIBRARY) environment.DOCS_LIBRARY = resolve(from, environment.DOCS_LIBRARY);
  else usage('No library folder given.');
  if (parsed.values.content) environment.DOCS_CONTENT = parsed.values.content;
  if (parsed.values['site-url']) environment.SITE_URL = parsed.values['site-url'];
  if (parsed.values.out) environment.DOCS_OUT = resolve(from, parsed.values.out);
  else if (environment.DOCS_OUT) environment.DOCS_OUT = resolve(from, environment.DOCS_OUT);
  if (environment.SITE_URL && !URL.canParse(environment.SITE_URL)) usage(`"${environment.SITE_URL}" is not a URL.`);
  // dev and prepare build nothing, so they leave the output folder alone.
  const outProblem =
    environment.DOCS_OUT && (command === 'build' || command === 'preview')
      ? outFolderProblem(environment.DOCS_OUT)
      : undefined;
  if (outProblem) usage(outProblem);
  const port = parsed.values.port ? ['--port', parsed.values.port] : [];

  let library;
  try {
    library = resolveLibrary(environment);
    // The same check astro.config.mjs makes, made here first so its message stands alone: a
    // duplicate key, an unclosed region or a malformed marker in the library's sample files.
    readSnippets({ files: library.sampleFiles, relativeTo: library.root });
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  lock(library);
  mount(library);
  console.log(`Mounted ${library.contentPath}/ of ${library.root}`);
  if (command === 'prepare') return 0;

  if (command === 'dev') {
    // The dev server follows the mount; this keeps the mount following the library. Astro itself
    // restarts when a sample file changes (src/snippets/satteri.mjs).
    let timer;
    const watcher = watch(library.contentDirectory, { recursive: true }, () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          mount(library);
        } catch (error) {
          console.error(`Could not update the mounted copy: ${error.message}`);
        }
      }, 100);
    });
    // --ignore-lock keeps Astro in the foreground, where this script's watcher lives and Ctrl+C ends
    // both; without it Astro can start its server detached, in the background.
    const code = await finished(runAstro(['dev', '--ignore-lock', ...port], environment));
    watcher.close();
    return code;
  }

  // A full build every time: Astro's content cache is keyed by a page's own text, and a sample
  // lives in another file. --force clears it.
  const built = await finished(runAstro(['build', '--force'], environment));
  if (built !== 0) {
    // Astro and its plugins name the file they read, which is the mounted copy.
    console.error(
      `\nThe build of ${library.root} failed. In the messages above, a path under ${mountPath}/ is the same path under ${library.contentPath}/ in the library.`,
    );
  }
  if (built !== 0 || command === 'build') return built;
  return finished(runAstro(['preview', '--ignore-lock', ...port], environment));
}

process.exit(await main());
