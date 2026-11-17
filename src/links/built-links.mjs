// Copyright © NCode Group
// SPDX-License-Identifier: Apache-2.0

// The last word on links: after the build, every built page is read, and the build fails on
//
//   1. a site-absolute URL that does not start with the base path. The base-path plugin and the
//      route middleware add the base wherever an author can write a link as plain text; a link a
//      component computes (`href={...}`) is beyond them and beyond the link validator;
//   2. a site-absolute URL the built site has no file for. The link validator reads the links of a
//      page's body and frontmatter; a `link` of the sidebar in site.config.json, and anything a
//      component renders, it never sees.
//
// A fragment (`#heading`) is not checked here: the link validator checks it where an author can
// write one.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** A comment, or an opening tag with its attributes: a quoted value may hold a ">". */
const TAG = /<!--[\s\S]*?-->|<([a-zA-Z][^\s/>]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
/** An attribute, with its value as HTML allows it: in double quotes, in single quotes, or bare. */
const ATTRIBUTE = /([^\s"'=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
/** Elements whose content is text, never markup. */
const TEXT_ONLY = new Set(['script', 'style', 'textarea', 'title']);
/** The attributes that hold one URL; `srcset` holds several. */
const URL_ATTRIBUTES = new Set(['href', 'src', 'action', 'poster']);

/**
 * Every site-absolute URL a page links to or loads: one slash at the start, not two. Only the
 * attributes of the page's own tags are read. HTML a page shows as text, such as `<a href="/x/">`
 * in a line of code, is escaped there and is no tag; comments, scripts and styles are skipped.
 */
export function siteAbsoluteUrls(html) {
  const urls = [];
  TAG.lastIndex = 0;
  for (let tag = TAG.exec(html); tag; tag = TAG.exec(html)) {
    if (tag[1] === undefined) continue;
    const name = tag[1].toLowerCase();
    for (const [, attribute, double, single, bare] of tag[2].matchAll(ATTRIBUTE)) {
      const value = double ?? single ?? bare ?? '';
      if (URL_ATTRIBUTES.has(attribute.toLowerCase())) urls.push(value);
      else if (attribute.toLowerCase() === 'srcset')
        urls.push(...value.split(',').map((entry) => entry.trim().split(/\s+/)[0]));
    }
    if (TEXT_ONLY.has(name)) {
      const close = new RegExp(`</${name}\\b`, 'gi');
      close.lastIndex = TAG.lastIndex;
      TAG.lastIndex = close.exec(html)?.index ?? html.length;
    }
  }
  return urls.filter((url) => url.startsWith('/') && !url.startsWith('//'));
}

/** Files written after this check runs, by an integration Starlight adds: never reported as missing. */
const WRITTEN_LATER = new Set(['/sitemap-index.xml']);

const prefixOf = (base) => (base.replace(/^\/|\/$/g, '') === '' ? '' : `/${base.replace(/^\/|\/$/g, '')}`);

/** Every built page under `directory`: its path from the site's root, and its HTML. */
function* builtPages(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* builtPages(path);
    else if (entry.name.endsWith('.html')) yield { path, html: readFileSync(path, 'utf8') };
  }
}

const pageName = (directory, path) => path.slice(directory.length).split(sep).join('/').replace(/^\/?/, '/');

/**
 * @param {string} directory The built site.
 * @param {string} base The base path, such as /Buffers or /.
 * @returns {{ page: string, url: string }[]} Each URL outside the base, with the built page that has it.
 */
export function urlsOutsideBase(directory, base) {
  const prefix = prefixOf(base);
  if (prefix === '') return [];
  const found = [];
  for (const { path, html } of builtPages(directory)) {
    for (const url of new Set(siteAbsoluteUrls(html))) {
      if (url !== prefix && !url.startsWith(`${prefix}/`)) found.push({ page: pageName(directory, path), url });
    }
  }
  return found;
}

/** Whether the built site answers `path` (from the site's root, no query or fragment) with a file. */
function hasTarget(directory, path) {
  const target = join(directory, ...path.split('/'));
  if (!existsSync(target)) return false;
  // A folder answers with its index.html, with or without the slash (GitHub Pages redirects to it).
  return statSync(target).isDirectory() ? existsSync(join(target, 'index.html')) : true;
}

/**
 * @param {string} directory The built site.
 * @param {string} base The base path, such as /Buffers or /.
 * @returns {{ url: string, pages: string[] }[]} Each URL under the base that the site has no file for, with the built pages that have it.
 */
export function urlsWithoutTarget(directory, base) {
  const prefix = prefixOf(base);
  const missing = new Map();
  const known = new Map();
  for (const { path, html } of builtPages(directory)) {
    for (const url of new Set(siteAbsoluteUrls(html))) {
      if (prefix !== '' && url !== prefix && !url.startsWith(`${prefix}/`)) continue;
      let target = url.slice(prefix.length).split(/[?#]/)[0] || '/';
      try {
        target = decodeURIComponent(target);
      } catch {
        // Not percent-encoding: looked up as written.
      }
      if (WRITTEN_LATER.has(target)) continue;
      if (!known.has(target)) known.set(target, hasTarget(directory, target));
      if (known.get(target)) continue;
      if (!missing.has(url)) missing.set(url, []);
      missing.get(url).push(pageName(directory, path));
    }
  }
  return [...missing].map(([url, pages]) => ({ url, pages }));
}

/** An Astro integration: fails the build when a built page links outside the base, or to nothing. */
export function checkBuiltLinks(base) {
  return {
    name: 'ncode-check-built-links',
    hooks: {
      'astro:build:done': ({ dir }) => {
        const directory = fileURLToPath(dir).replace(/[\\/]$/, '');
        const outside = urlsOutsideBase(directory, base);
        if (outside.length > 0) {
          const lines = outside.map(({ page, url }) => `${page} links to ${url}`);
          throw new Error(
            `${outside.length === 1 ? 'A link leaves' : `${outside.length} links leave`} the site's base path ${base}:\n  ${lines.join('\n  ')}\n` +
              'A link written as plain text gets the base added; one a component computes does not. ' +
              'Build it from import.meta.env.BASE_URL, or write it as plain text.',
          );
        }
        const nowhere = urlsWithoutTarget(directory, base);
        if (nowhere.length > 0) {
          const lines = nowhere.map(({ url, pages }) => {
            const shown = pages.slice(0, 3).join(', ') + (pages.length > 3 ? ` and ${pages.length - 3} more` : '');
            return `${url} (on ${pages.length === 1 ? 'the built page' : 'the built pages'} ${shown})`;
          });
          throw new Error(
            `${nowhere.length === 1 ? 'A link leads' : `${nowhere.length} links lead`} to nothing the site has:\n  ${lines.join('\n  ')}\n` +
              'A link on every page is in the navigation: check each "link" of the sidebar in site.config.json, written from the site\'s root without the base path. ' +
              'Otherwise it is one a component renders.',
          );
        }
      },
    },
  };
}
