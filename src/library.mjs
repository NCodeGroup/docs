// Copyright © NCode Group
// SPDX-License-Identifier: Apache-2.0

// The library a build is for. Nothing about a library is committed to this repository: the build is
// pointed at one through two environment variables, which scripts/site.mjs sets from its arguments
// and the reusable workflow sets from its inputs.
//
//   DOCS_LIBRARY   the library's repository folder (required)
//   DOCS_CONTENT   the content folder inside it, relative, with forward slashes (default docs/site)
import { spawnSync } from 'node:child_process';
import { existsSync, globSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate } from './json-schema.mjs';

export const CONFIG_FILE = 'site.config.json';
export const DEFAULT_CONTENT = 'docs/site';
const DEFAULT_SAMPLES = 'tests/**/*.cs';

const posix = (path) => path.split(sep).join('/');

/** The toolchain's own folder. */
export const toolchainRoot = fileURLToPath(new URL('..', import.meta.url));
/** Where scripts/site.mjs mounts a library's content folder: the folder Starlight reads pages from. */
export const mountDirectory = join(toolchainRoot, 'src', 'content', 'docs');
/** The mount from the toolchain's folder, with forward slashes, as Astro names a page's file: src/content/docs. */
export const mountPath = posix(relative(toolchainRoot, mountDirectory));
/** Names the process that holds the mount, while scripts/site.mjs runs; in a folder git ignores. */
export const lockFile = join(toolchainRoot, 'node_modules', '.ncode-docs-site.lock');

/** The names a library's own 404 page can have, at the root of its content folder. */
const NOT_FOUND_PAGES = ['404.mdx', '404.md'];

/**
 * The library's own 404 page, by its name at the root of its content folder, or undefined. Read on each call,
 * because the dev server's mount follows a page an author adds or removes.
 * @param {{ contentDirectory: string, contentPath: string }} library
 * @returns {string | undefined}
 * @throws {Error} When the content folder has both, which would be one page.
 */
export function ownNotFoundPage(library) {
  const found = NOT_FOUND_PAGES.filter((name) => existsSync(join(library.contentDirectory, name)));
  if (found.length > 1) {
    throw new Error(
      `${library.contentPath}/404.mdx and ${library.contentPath}/404.md are both the site's 404 page: keep one of them.`,
    );
  }
  return found[0];
}

const schema = JSON.parse(readFileSync(join(toolchainRoot, 'schema', 'site.config.schema.json'), 'utf8'));

/** Folders a sample glob never reads from: build output and packages, which hold copies of sources. */
const NEVER_READ = new Set(['bin', 'obj', 'node_modules', 'TestResults', '.git']);

/** Whether a path relative to the library's root, with forward slashes, leads out of the library. */
const isOutside = (inLibrary) => inLibrary === '..' || inLibrary.startsWith('../') || isAbsolute(inLibrary);
/** Whether a path relative to the library's root, with forward slashes, is in a folder never read. */
const isNeverRead = (inLibrary) => inLibrary.split('/').some((segment) => NEVER_READ.has(segment));

/**
 * Resolves and checks the library the environment names. Throws an error that says what to fix.
 * @param {Record<string, string | undefined>} [environment]
 */
export function resolveLibrary(environment = process.env) {
  if (!environment.DOCS_LIBRARY) {
    throw new Error(
      "No library to build: set DOCS_LIBRARY to the library's repository folder, or run \"npm run site '--' build <folder>\".",
    );
  }
  const root = resolve(environment.DOCS_LIBRARY);
  if (!existsSync(root) || !statSync(root).isDirectory()) throw new Error(`The library folder ${root} does not exist.`);

  const contentPath = posix(environment.DOCS_CONTENT || DEFAULT_CONTENT).replace(/^\.\/|\/+$/g, '');
  if (contentPath === '' || isAbsolute(contentPath) || contentPath.split('/').includes('..')) {
    throw new Error(
      `The content path "${environment.DOCS_CONTENT}" must be a folder inside the library, relative to its root, such as ${DEFAULT_CONTENT}.`,
    );
  }
  const contentDirectory = join(root, ...contentPath.split('/'));
  const configFile = join(contentDirectory, CONFIG_FILE);
  const configName = `${contentPath}/${CONFIG_FILE}`;
  if (!existsSync(configFile)) {
    throw new Error(
      `${configName} was not found in ${root}. A library's content folder holds its pages and that file; pass another folder with --content.`,
    );
  }

  let config;
  try {
    // Without a byte order mark, which some Windows editors write and JSON.parse refuses.
    config = JSON.parse(readFileSync(configFile, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    throw new Error(`${configName} is not valid JSON: ${error.message}`);
  }
  const problems = validate(config, schema);
  if (problems.length > 0)
    throw new Error(`${configName} is not a valid site configuration:\n  ${problems.join('\n  ')}`);

  const repository = { url: config.repository.url, branch: config.repository.branch ?? 'main' };
  const globs = config.samples ?? [DEFAULT_SAMPLES];
  // A file's real path is compared with the root's real path, not with the root as given: a library
  // checked out under a linked folder, such as macOS's /tmp, would otherwise be outside itself.
  const realRoot = realpathSync(root);
  const sampleFiles = [];
  for (const glob of globs) {
    // The exclude callback keeps a wildcard out of those folders; the check below is the rule.
    const found = globSync(glob, {
      cwd: root,
      exclude: (name) => NEVER_READ.has(typeof name === 'string' ? name : name.name),
    });
    for (const file of found) {
      // Each match is checked as a path, not the glob as text: "[.][.]/x" and "{..,tests}/x" reach
      // the folder above the root as "tests/../../x" does. resolve, not join, so that an absolute
      // match, which a brace pattern can give, is checked as the path it is.
      const path = resolve(root, file);
      const inLibrary = posix(relative(root, path));
      if (isOutside(inLibrary)) {
        throw new Error(
          `${configName}: the samples glob "${glob}" matches ${posix(file)}, which is outside the library. A glob names files under the repository root, such as ${DEFAULT_SAMPLES}.`,
        );
      }
      // exclude is given a folder a glob names literally as a path, such as "tests/bin", not as a name.
      // Before anything follows a link: nothing in a folder that is never read stops the build.
      if (isNeverRead(inLibrary)) continue;
      let stats;
      let realPath;
      try {
        stats = statSync(path);
        realPath = stats.isFile() ? realpathSync(path) : undefined;
      } catch (error) {
        // Both follow every symbolic link on the path, and Node's error for a link that leads
        // nowhere or around in a loop names neither this file nor the glob.
        throw new Error(
          `${configName}: the samples glob "${glob}" matches ${posix(file)}, which could not be read: ${error.message}`,
          { cause: error },
        );
      }
      if (!stats.isFile()) continue;
      // A path under the root still leads out of it when the file, or a folder on its path, is a
      // symbolic link to a place outside, so a file is read only where it really is: inside the
      // library, and in no folder that is never read. A hard link or a mounted folder is no
      // symbolic link, so it is read where it appears; a git checkout holds neither.
      // This checks the checkout as it is when the build starts, as committed. A process that
      // changes files while the build runs could put a link in place of a checked file before
      // readSnippets reads it, but such a process could as well add a page whose code reads that
      // file, because a library's pages run in the build.
      const reallyInLibrary = posix(relative(realRoot, realPath));
      if (isOutside(reallyInLibrary)) {
        throw new Error(
          `${configName}: the samples glob "${glob}" matches ${posix(file)}, which is outside the library through a symbolic link: its real path is ${realPath}. A sample file is under the repository root once every link on its path is followed.`,
        );
      }
      // Kept as the path the glob matched, not the real path: a message names a sample file as its
      // author knows it.
      if (!isNeverRead(reallyInLibrary)) sampleFiles.push(path);
    }
  }

  return {
    root,
    contentPath,
    contentDirectory,
    configName,
    config: {
      title: config.title,
      description: config.description,
      product: config.product ?? config.title,
      mark: config.mark ?? 'ncode',
      version: config.version,
      repository,
      siteUrl: config.site.url,
      sidebar: config.sidebar,
      social: config.social ?? [{ label: 'GitHub', href: repository.url }],
      samples: globs,
      editLinks: config.editLinks ?? true,
      lastUpdated: config.lastUpdated ?? true,
      requiredHeadings: config.requiredHeadings ?? [],
    },
    sampleFiles: [...new Set(sampleFiles)].sort(),
  };
}

/**
 * The site's base path, without a final slash, '/' for a site at the root: from SITE_URL, else
 * site.url of site.config.json.
 * @param {{ config: { siteUrl: string } }} library
 * @param {Record<string, string | undefined>} [environment]
 */
export function siteBase(library, environment = process.env) {
  return new URL(environment.SITE_URL || library.config.siteUrl).pathname.replace(/\/$/, '') || '/';
}

/**
 * A page's path as its author knows it: relative to the library's root, whether `file` is the
 * mounted copy or the original.
 */
export function libraryPath(library, file) {
  const fromMount = relative(mountDirectory, file);
  if (!fromMount.startsWith('..') && !isAbsolute(fromMount)) return `${library.contentPath}/${posix(fromMount)}`;
  const fromRoot = relative(library.root, file);
  return fromRoot.startsWith('..') || isAbsolute(fromRoot) ? file : posix(fromRoot);
}

/**
 * Prints a warning: as an annotation in GitHub Actions (when `GITHUB_ACTIONS` is `'true'`), else as
 * the message itself. A workflow command's data escapes `%`, CR and LF, because an unescaped line
 * break ends the command early.
 * @param {string} message
 * @param {Record<string, string | undefined>} [environment]
 */
export function warn(message, environment = process.env) {
  console.warn(
    environment.GITHUB_ACTIONS === 'true'
      ? `::warning::${message.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')}`
      : message,
  );
}

/**
 * The time of the newest commit that changed each file of the content folder, in milliseconds, by
 * the file's path under that folder. Empty when the library is not in a git repository. A shallow
 * clone gives every file the date of its one commit, which is why the workflow fetches all history.
 * Empty too, with a warning that names the folder and git's message (an annotation in GitHub
 * Actions), when the library is in a repository whose history git cannot read: git is not
 * installed, another user owns the repository, or its .git file points to a folder that is gone.
 * The build goes on, because a missing date is not worth stopping a build or a dev server for.
 * @param {{ root: string, contentPath: string }} library
 * @param {Record<string, string | undefined>} [environment]
 * @returns {Record<string, number>}
 */
export function readLastUpdated(library, environment = process.env) {
  // One "git log" for the folder, as Starlight does it: a commit's time, then the files it changed.
  const log = spawnSync(
    'git',
    ['log', '--format=t:%ct', '--name-only', '--relative', '-z', '--', library.contentPath],
    {
      cwd: library.root,
      env: environment,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  if (log.error || log.status !== 0) {
    // A folder in no repository has no dates, and that needs no word. git's message cannot tell it
    // from a repository git refuses: a .git file that points nowhere also says "not a git
    // repository", and the message is translated. So the folders above the library decide.
    if (!inRepository(library.root)) return {};
    const reason = log.error?.message ?? (log.stderr.trim().split(/\r?\n/)[0] || `git exited with code ${log.status}`);
    const message = `No page shows a "last updated" date: git could not read the history of ${library.root}: ${reason}`;
    warn(message, environment);
    return {};
  }
  const dates = {};
  let time = 0;
  for (const raw of log.stdout.split('\0')) {
    const entry = raw.replace(/^\n/, '');
    if (entry === '') continue;
    if (/^t:\d+$/.test(entry)) {
      time = Number(entry.slice(2)) * 1000;
    } else if (entry.startsWith(`${library.contentPath}/`)) {
      const file = entry.slice(library.contentPath.length + 1);
      dates[file] = Math.max(dates[file] ?? 0, time);
    }
  }
  return dates;
}

/**
 * A page's slug: its path under the content folder with forward slashes, without its .md or .mdx
 * extension, in lower case, as Starlight names the page.
 * @param {string} path A path under the content folder, with `/` or `\` separators.
 * @returns {string}
 */
export function pageSlug(path) {
  return path
    .replaceAll('\\', '/')
    .replace(/\.mdx?$/, '')
    .toLowerCase();
}

/**
 * The pages of a library, as the build mounts them: the .md and .mdx files of the content folder
 * and the folders under it, except the library's own 404 page, and files and folders whose names
 * start with `_` or `.`, and node_modules. A link to a folder is not followed.
 * @param {{ contentDirectory: string }} library
 * @returns {{ file: string, path: string, slug: string }[]} Sorted by `path`; `file` is absolute,
 *   `path` is relative to the content folder with forward slashes.
 */
export function listPages(library) {
  const found = [];
  const walk = (directory, prefix) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('_') || entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const path = `${prefix}${entry.name}`;
      if (entry.isDirectory()) {
        walk(join(directory, entry.name), `${path}/`);
      } else if (/\.mdx?$/.test(entry.name) && !(prefix === '' && NOT_FOUND_PAGES.includes(entry.name))) {
        found.push({ file: join(directory, entry.name), path, slug: pageSlug(path) });
      }
    }
  };
  walk(library.contentDirectory, '');
  return found.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/**
 * The commit the library's checkout is at, which a page's source links name. Prints nothing.
 * @param {{ root: string }} library
 * @param {Record<string, string | undefined>} [environment]
 * @returns {{ commit: string } | { commit: undefined, reason: string | undefined }} `reason` is git's
 *   message when the library is in a repository whose commit git cannot read, and undefined when it
 *   is in no repository.
 */
export function readCommit(library, environment = process.env) {
  const result = spawnSync('git', ['rev-parse', '--verify', 'HEAD^{commit}'], {
    cwd: library.root,
    env: environment,
    encoding: 'utf8',
  });
  const commit = result.stdout?.trim();
  if (!result.error && result.status === 0 && /^[0-9a-f]{40}$/.test(commit)) return { commit };
  if (!inRepository(library.root)) return { commit: undefined, reason: undefined };
  const reason =
    result.error?.message ?? (result.stderr.trim().split(/\r?\n/)[0] || `git exited with code ${result.status}`);
  return { commit: undefined, reason };
}

/** Whether `folder` or a folder above it holds a .git folder or file, where git looks for a repository. */
function inRepository(folder) {
  for (let current = resolve(folder); ; current = dirname(current)) {
    if (existsSync(join(current, '.git'))) return true;
    if (dirname(current) === current) return false;
  }
}
