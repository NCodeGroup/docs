// Copyright © NCode Group
// SPDX-License-Identifier: Apache-2.0

// The custom properties a stylesheet or a component defines and reads, and the check that a library's own
// components read only the brand's public tokens: CONTRACT.md section 7 forbids a step of a colour ramp or of the
// type scale, and a property nothing defines makes the declaration that reads it invalid, so the component renders
// without it.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { libraryPath, toolchainRoot } from '../library.mjs';

/**
 * The brand's private primitives, which brand's ADR-1002 lets any release change: the steps of its colour ramps and
 * of its type scale.
 */
export const PRIMITIVE =
  /^--nc-(?:(?:blue|stone|green|amber|red)-\d+|(?:text|weight|width|leading|tracking)-[a-z0-9]+)$/;

/** The toolchain's files that define the tokens a library's components may read. */
const BRAND_FILES = ['vendor/brand/tokens/tokens.css', 'vendor/brand/css/starlight.css', 'src/styles/theme.css'];

/**
 * The custom properties a stylesheet or a component defines.
 * @param {string} text
 * @returns {string[]} In the order found, with duplicates.
 */
export function definedProperties(text) {
  return [...text.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((match) => match[1]);
}

/**
 * The custom properties a file reads, with or without a fallback.
 * @param {string} text
 * @returns {string[]} In the order found, with duplicates.
 */
export function readProperties(text) {
  return [...text.matchAll(/var\(\s*(--[a-z0-9-]*[a-z0-9])\s*[,)]/g)].map((match) => match[1]);
}

/**
 * The custom properties the brand's stylesheets and the theme define.
 * @returns {Set<string>}
 */
export function brandProperties() {
  return new Set(BRAND_FILES.flatMap((path) => definedProperties(readFileSync(join(toolchainRoot, path), 'utf8'))));
}

/**
 * The `.astro` and `.css` files under a folder, sorted by path. A link is not followed, and names that start with
 * `.` and node_modules are skipped, as `listPages` does.
 * @param {string} directory
 * @returns {string[]} Absolute paths.
 */
function componentFiles(directory) {
  const found = [];
  const walk = (current, prefix) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const path = `${prefix}${entry.name}`;
      if (entry.isDirectory()) walk(join(current, entry.name), `${path}/`);
      else if (entry.isFile() && /\.(?:astro|css)$/.test(entry.name))
        found.push({ file: join(current, entry.name), path });
    }
  };
  walk(directory, '');
  return found.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)).map(({ file }) => file);
}

/**
 * Stops on a `--nc-` custom property that a component of the library reads and the brand does not define, and on a
 * step of the brand's colour ramps or type scale. Reads every `.astro` and `.css` file under `_components/` of the
 * content folder; a component may read Starlight's `--sl-` properties and the ones it defines itself.
 * @param {{ root: string, contentDirectory: string, contentPath: string }} library
 * @param {Set<string>} [known] The properties the brand defines.
 * @returns {void}
 * @throws {Error} Naming each file and token.
 */
export function checkComponentTokens(library, known = brandProperties()) {
  const directory = join(library.contentDirectory, '_components');
  if (!existsSync(directory)) return;
  const problems = [];
  for (const file of componentFiles(directory)) {
    const text = readFileSync(file, 'utf8');
    const own = new Set(definedProperties(text));
    const path = libraryPath(library, file);
    // A name is reported once per file, in the order of its first read.
    for (const name of new Set(readProperties(text))) {
      if (!name.startsWith('--nc-')) continue;
      // A primitive is reported as one even when the brand defines it: a brand release may change it.
      if (PRIMITIVE.test(name))
        problems.push(
          `${path} reads ${name}, a step of the brand's colour ramps or type scale, which a brand release may change; read a colour role or a type role instead.`,
        );
      else if (!known.has(name) && !own.has(name))
        problems.push(`${path} reads ${name}, which the brand does not define.`);
    }
  }
  if (problems.length === 1) throw new Error(problems[0]);
  if (problems.length > 1)
    throw new Error(
      `The library's components read custom properties the brand does not offer:\n  ${problems.join('\n  ')}`,
    );
}
