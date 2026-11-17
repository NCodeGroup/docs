#!/usr/bin/env node
// Checks that every vendored file is the file its manifest names, byte for byte.
//
//   node scripts/check-vendor.mjs            fails when a vendored file was edited, added or removed
//   node scripts/check-vendor.mjs --update   records the files as they are now, after a new drop
//
// A vendor folder (vendor/<name>/) holds files copied from another source, with a manifest.json that
// names the source, its version and each file's SHA-256. Vendored files are never edited here: a
// change is made at the source and dropped in whole, then recorded with --update and a new version.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const MANIFEST = 'manifest.json';

function* filesUnder(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* filesUnder(path);
    else if (entry.isFile()) yield path;
  }
}

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

/**
 * @param {string} vendorRoot The folder that holds one folder per vendored source.
 * @param {{ update?: boolean }} [options]
 * @returns {string[]} The problems found; empty when every file matches.
 */
export function checkVendor(vendorRoot, { update = false } = {}) {
  const problems = [];
  for (const entry of readdirSync(vendorRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const folder = join(vendorRoot, entry.name);
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(join(folder, MANIFEST), 'utf8'));
    } catch (error) {
      problems.push(`vendor/${entry.name}: no readable ${MANIFEST} (${error.message})`);
      continue;
    }
    const actual = {};
    for (const path of filesUnder(folder)) {
      const name = relative(folder, path).split(sep).join('/');
      if (name !== MANIFEST) actual[name] = sha256(path);
    }
    if (update) {
      manifest.files = actual;
      writeFileSync(join(folder, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
      continue;
    }
    for (const key of ['source', 'version']) {
      if (typeof manifest[key] !== 'string' || manifest[key] === '')
        problems.push(`vendor/${entry.name}/${MANIFEST}: "${key}" is missing`);
    }
    const recorded = manifest.files ?? {};
    for (const [name, hash] of Object.entries(recorded)) {
      if (!(name in actual))
        problems.push(`vendor/${entry.name}/${name}: named in ${MANIFEST}, but the file is missing`);
      else if (actual[name] !== hash)
        problems.push(`vendor/${entry.name}/${name}: was edited (its SHA-256 is not the one ${MANIFEST} records)`);
    }
    for (const name of Object.keys(actual)) {
      if (!(name in recorded)) problems.push(`vendor/${entry.name}/${name}: not named in ${MANIFEST}`);
    }
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const vendorRoot = fileURLToPath(new URL('../vendor', import.meta.url));
  const update = process.argv.includes('--update');
  const problems = checkVendor(vendorRoot, { update });
  if (problems.length > 0) {
    console.error(
      `Vendored files do not match their manifest:\n  ${problems.join('\n  ')}\n\nVendored files are never edited here. Restore them, or after a new drop from the source run: node scripts/check-vendor.mjs --update`,
    );
    process.exit(1);
  }
  console.log(update ? 'Recorded the vendored files in their manifests.' : 'Vendored files match their manifests.');
}
