// The library a build is for. Nothing about a library is committed to this repository: the build is
// pointed at one through two environment variables, which scripts/site.mjs sets from its arguments
// and the reusable workflow sets from its inputs.
//
//   DOCS_LIBRARY   the library's repository folder (required)
//   DOCS_CONTENT   the content folder inside it, relative, with forward slashes (default docs/site)
import { spawnSync } from 'node:child_process';
import { existsSync, globSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate } from './json-schema.mjs';

export const CONFIG_FILE = 'site.config.json';
export const DEFAULT_CONTENT = 'docs/site';

/** The toolchain's own folder. */
export const toolchainRoot = fileURLToPath(new URL('..', import.meta.url));
/** Where scripts/site.mjs mounts a library's content folder: the folder Starlight reads pages from. */
export const mountDirectory = join(toolchainRoot, 'src', 'content', 'docs');
/** Names the process that holds the mount, while scripts/site.mjs runs; in a folder git ignores. */
export const lockFile = join(toolchainRoot, 'node_modules', '.ncode-docs-site.lock');

const schema = JSON.parse(readFileSync(join(toolchainRoot, 'schema', 'site.config.schema.json'), 'utf8'));

/** Folders a sample glob never descends into: build output and packages, which hold copies of sources. */
const NEVER_READ = new Set(['bin', 'obj', 'node_modules', 'TestResults', '.git']);

const posix = (path) => path.split(sep).join('/');

/**
 * Resolves and checks the library the environment names. Throws an error that says what to fix.
 * @param {Record<string, string | undefined>} [environment]
 */
export function resolveLibrary(environment = process.env) {
  if (!environment.DOCS_LIBRARY) {
    throw new Error('No library to build: set DOCS_LIBRARY to the library\'s repository folder, or run "npm run build -- <folder>".');
  }
  const root = resolve(environment.DOCS_LIBRARY);
  if (!existsSync(root) || !statSync(root).isDirectory()) throw new Error(`The library folder ${root} does not exist.`);

  const contentPath = posix(environment.DOCS_CONTENT || DEFAULT_CONTENT).replace(/^\.\/|\/+$/g, '');
  if (contentPath === '' || isAbsolute(contentPath) || contentPath.split('/').includes('..')) {
    throw new Error(`The content path "${environment.DOCS_CONTENT}" must be a folder inside the library, relative to its root, such as ${DEFAULT_CONTENT}.`);
  }
  const contentDirectory = join(root, ...contentPath.split('/'));
  const configFile = join(contentDirectory, CONFIG_FILE);
  const configName = `${contentPath}/${CONFIG_FILE}`;
  if (!existsSync(configFile)) {
    throw new Error(`${configName} was not found in ${root}. A library's content folder holds its pages and that file; pass another folder with --content.`);
  }

  let config;
  try {
    // Without a byte order mark, which some Windows editors write and JSON.parse refuses.
    config = JSON.parse(readFileSync(configFile, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    throw new Error(`${configName} is not valid JSON: ${error.message}`);
  }
  const problems = validate(config, schema);
  if (problems.length > 0) throw new Error(`${configName} is not a valid site configuration:\n  ${problems.join('\n  ')}`);

  const repository = { url: config.repository.url, branch: config.repository.branch ?? 'main' };
  const globs = config.samples ?? ['tests/**/*.cs'];
  const sampleFiles = [];
  for (const glob of globs) {
    const found = globSync(glob, { cwd: root, exclude: (name) => NEVER_READ.has(typeof name === 'string' ? name : name.name) });
    for (const file of found) {
      const path = join(root, file);
      if (statSync(path).isFile()) sampleFiles.push(path);
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
    },
    sampleFiles: [...new Set(sampleFiles)].sort(),
  };
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
 * The time of the newest commit that changed each file of the content folder, in milliseconds, by
 * the file's path under that folder. Empty when the library is not in a git repository. A shallow
 * clone gives every file the date of its one commit, which is why the workflow fetches all history.
 * @returns {Record<string, number>}
 */
export function readLastUpdated(library) {
  // One "git log" for the folder, as Starlight does it: a commit's time, then the files it changed.
  const log = spawnSync('git', ['log', '--format=t:%ct', '--name-only', '--relative', '-z', '--', library.contentPath], {
    cwd: library.root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (log.error || log.status !== 0) return {};
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
