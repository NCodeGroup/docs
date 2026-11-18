// Copyright © NCode Group
// SPDX-License-Identifier: Apache-2.0

// Shared by the tests: build a library's site into a folder of its own, make a changed copy of the
// fixture library, read the built pages, and serve a built site the way GitHub Pages does.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export { siteAbsoluteUrls } from '../src/links/built-links.mjs';

export const root = fileURLToPath(new URL('..', import.meta.url));
export const fixture = join(root, 'fixture');
/** Everything the tests write, ignored by git. */
export const work = join(root, '.work');

/**
 * Whether this system makes symbolic links. Windows makes one only in Developer Mode or for an
 * administrator, so there a test that needs one is skipped, and says why.
 */
export function makesLinks() {
  const probe = join(work, 'link-probe');
  mkdirSync(work, { recursive: true });
  rmSync(probe, { force: true });
  try {
    symlinkSync('.', probe);
  } catch (error) {
    if (error.code === 'EPERM') return false;
    throw error;
  }
  rmSync(probe);
  return true;
}
export const withLinks = {
  skip: makesLinks()
    ? false
    : 'needs a symbolic link, which Windows makes only in Developer Mode or for an administrator',
};

/**
 * Runs `node scripts/site.mjs build` for a library.
 * @param {string} name The output goes to .work/out/<name>.
 * @param {{ library?: string, args?: string[], env?: Record<string, string> }} [options] `env` adds to the environment.
 * @returns {{ code: number, output: string, out: string }} The exit code, everything printed, the output folder.
 */
export function build(name, { library = fixture, args = [], env = {} } = {}) {
  const out = join(work, 'out', name);
  rmSync(out, { recursive: true, force: true });
  const environment = { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' };
  // A site URL or a library in the environment of whoever runs the tests is not the tests' input.
  for (const key of ['SITE_URL', 'DOCS_LIBRARY', 'DOCS_CONTENT', 'DOCS_OUT', 'INIT_CWD']) delete environment[key];
  const result = spawnSync(
    process.execPath,
    [join(root, 'scripts', 'site.mjs'), 'build', library, '--out', out, ...args],
    {
      cwd: root,
      env: { ...environment, ...env },
      encoding: 'utf8',
      timeout: 180_000,
    },
  );
  return { code: result.status ?? 1, output: `${result.stdout}\n${result.stderr}`, out };
}

/**
 * A copy of the fixture library, for a test to break.
 * @param {string} name The copy is .work/libraries/<name>.
 * @returns {string} Its folder.
 */
export function copyOfFixture(name) {
  const copy = join(work, 'libraries', name);
  rmSync(copy, { recursive: true, force: true });
  mkdirSync(join(work, 'libraries'), { recursive: true });
  cpSync(fixture, copy, { recursive: true });
  return copy;
}

/** Builds a copy of the fixture after `change` has edited it, and expects the build to fail. */
export function failingBuild(name, change) {
  const library = copyOfFixture(name);
  change(library);
  const result = build(name, { library });
  assert.notEqual(result.code, 0, `the build should have failed:\n${result.output}`);
  return result.output;
}

export const page = (body) => `---\ntitle: A broken page\n---\n\n${body}\n`;

/** Every built page under `out`: its path with forward slashes, and its HTML. */
export function pages(out) {
  const found = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.html'))
        found.push({
          file: path
            .slice(out.length + 1)
            .split(sep)
            .join('/'),
          html: readFileSync(path, 'utf8'),
        });
    }
  };
  walk(out);
  return found;
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml',
  '.wasm': 'application/wasm',
};

/**
 * Serves a built site under `base` on a free port, as GitHub Pages serves a project site: a folder
 * answers with its index.html, and an unknown path answers 404 with the site's 404.html.
 * @returns {Promise<{ origin: string, close: () => Promise<void> }>}
 */
export function serve(out, base) {
  const prefix = base.replace(/\/$/, '');
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    let file;
    if (path === prefix || path.startsWith(`${prefix}/`)) {
      const relative = path.slice(prefix.length).replace(/^\/+/, '');
      if (!relative.split('/').includes('..')) {
        file = join(out, ...relative.split('/'));
        if (path.endsWith('/') || relative === '') file = join(file, 'index.html');
      }
    }
    if (file && existsSync(file) && !file.endsWith(sep)) {
      try {
        const body = readFileSync(file);
        response.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
        response.end(body);
        return;
      } catch {
        // A folder asked for without its slash: fall through to the 404 page.
      }
    }
    response.writeHead(404, { 'content-type': TYPES['.html'] });
    response.end(readFileSync(join(out, '404.html')));
  });
  return new Promise((resolve) => {
    // Port 0: the system picks a free one.
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        origin: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise((closed) => {
            server.closeAllConnections();
            server.close(() => closed());
          }),
      });
    });
  });
}
