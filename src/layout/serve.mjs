// Copyright © NCode Group
// SPDX-License-Identifier: Apache-2.0

// The layout check and the tests serve a built site under its base path the way GitHub Pages does.
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, sep } from 'node:path';

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
