#!/usr/bin/env node
// Copyright © NCode Group
// SPDX-License-Identifier: Apache-2.0

// Builds, serves or previews one library's documentation site.
//
//   node scripts/site.mjs <build|dev|preview|check> <library folder> [options]
//
//   --content <path>    the content folder inside the library (default docs/site)
//   --site-url <url>    the URL the site is served at, base path included; replaces site.url of the
//                       library's site.config.json (the workflow passes the Pages URL this way)
//   --out <folder>      where the built site goes (default dist/ in this toolchain)
//   --port <number>     the port for dev and preview (default 4321)
//   --browser <path>    a Chromium-based browser for check, which loads the site that build wrote into
//                       --out and fails on content wider than its column
//
// The library folder and the content path may also come from DOCS_LIBRARY and DOCS_CONTENT, the site
// URL from SITE_URL, the output folder from DOCS_OUT and the browser from DOCS_BROWSER; an argument
// wins over its variable.
//
// What it does: checks the library's site.config.json, makes a folder of its own for the command under
// .runs/ (src/runs.mjs; it is removed when the command ends), mounts the content folder into that
// folder (a copy at src/content/docs/, see mount() below), and runs Astro there with the library named
// in the environment. Nothing is written to the library, and nothing of the library stays in this
// repository.
import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, utimesSync, watch } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  CONFIG_FILE,
  defaultOutFolder,
  listPages,
  mountPath,
  ownNotFoundPage,
  resolveLibrary,
  runMount,
  siteBase,
  toolchainRoot,
} from '../src/library.mjs';
import { lockOutput, startRun } from '../src/runs.mjs';
import { checkComponentTokens } from '../src/brand/tokens.mjs';
import { resolveHeadingRules } from '../src/headings/required-headings.mjs';
import { checkLayout, findBrowser, layoutMessage, sitePages, WIDTHS } from '../src/layout/check.mjs';
import { readSnippets } from '../src/snippets/catalog.mjs';

const COMMANDS = ['build', 'dev', 'preview', 'check'];
// The page mounted as 404.mdx when the library has none of its own.
const DEFAULT_NOT_FOUND = join(toolchainRoot, 'src', 'defaults', '404.mdx');

function usage(problem) {
  console.error(
    `${problem}\n\nUsage: node scripts/site.mjs <${COMMANDS.join('|')}> <library folder> [--content <path>] [--site-url <url>] [--out <folder>] [--port <number>] [--browser <path>]`,
  );
  process.exit(2);
}

/** Entries of a content folder that are never mounted. */
const skipped = (name) => name === CONFIG_FILE || name === 'node_modules' || name.startsWith('.');

/**
 * Makes `target` a copy of `source`: copies what is new or changed, removes what is gone. A file
 * that did not change is left alone, so the dev server reloads only what an author touched.
 * `extras` are files added at the top level, as `[name, file]` pairs, that `source` does not have.
 * @returns {number} How many files were copied or removed.
 */
function sync(source, target, top = true, extras = []) {
  let changes = 0;
  mkdirSync(target, { recursive: true });
  const wanted = new Map();
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (top && skipped(entry.name)) continue;
    if (entry.isDirectory() || entry.isFile()) {
      wanted.set(entry.name, { from: join(source, entry.name), directory: entry.isDirectory() });
    }
  }
  for (const [name, from] of extras) wanted.set(name, { from, directory: false });
  for (const entry of readdirSync(target, { withFileTypes: true })) {
    const match = wanted.get(entry.name);
    if (!match || match.directory !== entry.isDirectory()) {
      rmSync(join(target, entry.name), { recursive: true, force: true });
      changes++;
    }
  }
  for (const [name, { from, directory }] of wanted) {
    const to = join(target, name);
    if (directory) {
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
 * The toolchain's 404 page is mounted when the library has none of its own.
 */
function mount(library, run) {
  const extras = ownNotFoundPage(library) ? [] : [['404.mdx', DEFAULT_NOT_FOUND]];
  return sync(library.contentDirectory, runMount(run), true, extras);
}

function runAstro(args, environment, run) {
  // Astro's own entry file, run with this Node.js: no shell and no .cmd shim, so it is the same on Windows.
  const astro = join(toolchainRoot, 'node_modules', 'astro', 'bin', 'astro.mjs');
  if (!existsSync(astro)) {
    console.error(`The toolchain's packages are not installed: run "npm ci --ignore-scripts" in ${toolchainRoot}`);
    process.exit(1);
  }
  // Astro resolves --config from its root, the run's folder, and builds prerendered pages in the run's
  // .astro/ when the output folder is outside it, where they find the toolchain's packages.
  const config = relative(run, join(toolchainRoot, 'astro.config.mjs'));
  const child = spawn(process.execPath, [astro, ...args, '--config', config], {
    cwd: run,
    env: environment,
    stdio: 'inherit',
  });
  // Ending this script ends Astro too, so a server never outlives the command that started it.
  const stop = (signal) => child.kill(signal);
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, stop);
  child.on('exit', () => {
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.off(signal, stop);
  });
  return child;
}

const finished = (child) => new Promise((done) => child.on('exit', (code, signal) => done(code ?? (signal ? 1 : 0))));

/**
 * Loads the pages that `build` wrote into the output folder in a browser, at each width of the
 * layout check, and fails on content that leaves its column (ADR-1013). It reads the built site
 * and writes nothing, so it takes no output folder's lock, makes no run folder and mounts no library.
 */
async function checkBuiltSite(library, environment, out) {
  if (!existsSync(join(out, 'index.html'))) {
    console.error(`No built site in ${out}: build it first, with the same --out.`);
    return 1;
  }
  const base = siteBase(library, environment);
  const pages = sitePages(library, out);
  try {
    const browser = await findBrowser(environment);
    const problems = await checkLayout({ out, base, pages, browser });
    if (problems.length > 0) {
      console.error(layoutMessage(problems));
      return 1;
    }
  } catch (error) {
    console.error(error.message);
    return 1;
  }
  console.log(`The layout of ${pages.length} pages fits their content columns at ${WIDTHS.join(', ')} px.`);
  return 0;
}

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
        browser: { type: 'string' },
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
  // Read straight from process.env, not from the copy: CodeQL's clear-text-logging check takes a value read from a copy
  // of the environment for the whole environment, and these two are printed.
  const siteUrl = parsed.values['site-url'] ?? process.env.SITE_URL;
  if (siteUrl) environment.SITE_URL = siteUrl;
  const outFolder = parsed.values.out ?? process.env.DOCS_OUT;
  const out = outFolder ? resolve(from, outFolder) : defaultOutFolder;
  environment.DOCS_OUT = out;
  // A browser with a separator is a path, relative to where the command was typed; one without is a command on PATH.
  const browser = parsed.values.browser ?? environment.DOCS_BROWSER;
  if (browser) environment.DOCS_BROWSER = /[\\/]/.test(browser) ? resolve(from, browser) : browser;
  if (siteUrl && !URL.canParse(siteUrl)) usage(`"${siteUrl}" is not a URL.`);
  const port = parsed.values.port ? ['--port', parsed.values.port] : [];

  let library;
  try {
    library = resolveLibrary(environment);
    // The same check astro.config.mjs makes, made here first so its message stands alone: a
    // duplicate key, an unclosed region or a malformed marker in the library's sample files.
    readSnippets({ files: library.sampleFiles, relativeTo: library.root });
    // The check astro.config.mjs makes of requiredHeadings (a glob that matches no page, an
    // exception the globs do not cover, a heading listed twice), made first so its message stands
    // alone, before the lock and the mount.
    resolveHeadingRules(library.config.requiredHeadings, listPages(library), library);
    // The check astro.config.mjs makes of the tokens the library's components read (a token the
    // brand does not define, a step of a ramp or scale), made first so its message stands alone,
    // before the lock and the mount.
    checkComponentTokens(library);
    // Fails on a content folder with both 404.mdx and 404.md, as mount() would, before the lock.
    ownNotFoundPage(library);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  if (command === 'check') return checkBuiltSite(library, environment, out);
  // Two commands that write one output folder conflict, so a build or preview takes it before it starts.
  if (command !== 'dev') {
    try {
      lockOutput(out, library.root);
    } catch (error) {
      console.error(error.message);
      process.exit(1);
    }
  }
  const run = startRun();
  environment.DOCS_RUN = run;
  mount(library, run);
  console.log(`Mounted ${library.contentPath}/ of ${library.root}`);

  if (command === 'dev') {
    // The dev server follows the mount; this keeps the mount following the library. Astro itself
    // restarts when a sample file changes (src/snippets/satteri.mjs).
    let timer;
    const watcher = watch(library.contentDirectory, { recursive: true }, () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          mount(library, run);
        } catch (error) {
          console.error(`Could not update the mounted copy: ${error.message}`);
        }
      }, 100);
    });
    // --ignore-lock keeps Astro in the foreground, where this script's watcher lives and Ctrl+C ends
    // both; without it Astro can start its server detached, in the background.
    const code = await finished(runAstro(['dev', '--ignore-lock', ...port], environment, run));
    watcher.close();
    return code;
  }

  // A full build every time: Astro's content cache is keyed by a page's own text, and a sample
  // lives in another file. --force clears it.
  const built = await finished(runAstro(['build', '--force'], environment, run));
  if (built !== 0) {
    // Astro and its plugins name the file they read, which is the mounted copy.
    console.error(
      `\nThe build of ${library.root} failed. In the messages above, a path under ${mountPath}/ is the same path under ${library.contentPath}/ in the library.`,
    );
  }
  if (built !== 0 || command === 'build') return built;
  return finished(runAstro(['preview', '--ignore-lock', ...port], environment, run));
}

process.exit(await main());
