// A library's code samples are regions of its compiled tests: this module reads every region a
// source file marks with a begin and an end marker comment and hands it out by key, so a page never
// holds a copy of a sample. It renders a region as MarkdownSnippets renders the same region into a
// README: marker lines dropped, the first line's indentation removed, runs of blank lines
// collapsed. It is stricter than the tool: a duplicate key, an unclosed region, a malformed marker
// and an unknown key are errors, so the site build fails instead of publishing a wrong or missing
// sample.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';

const BEGIN = /^\/\/ begin-snippet: (.*)$/;
const END = /^\/\/ end-snippet$/;
// Any other spelling of a marker comment, whatever its case or spacing: reported, never skipped.
const MALFORMED = /^\/\/\s*(begin|end)-snippet/i;
const KEY = /^[A-Za-z0-9](?:[A-Za-z0-9_.-]*[A-Za-z0-9])?$/;

/** The region's lines as MarkdownSnippets renders them (its `LoopState.AppendLine`). */
function render(lines) {
  let text = '';
  let started = false;
  let padCharacter = '';
  let padLength = 0;
  let emptyRun = 0;
  for (const line of lines) {
    if (!started) {
      if (line.trim() === '') continue;
      started = true;
      if (line[0] === ' ' || line[0] === '\t') {
        padCharacter = line[0];
        while (padLength < line.length && line[padLength] === padCharacter) padLength++;
      }
    } else if (emptyRun < 2) {
      text += '\n';
    }
    let remove = 0;
    while (remove < padLength && remove < line.length && line[remove] === padCharacter) remove++;
    text += line.slice(remove);
    emptyRun = line.length === 0 ? emptyRun + 1 : 0;
  }
  return text.trimEnd();
}

/**
 * Reads the samples in `files`: the files the library's sample globs match.
 * @param {{ files: string[], relativeTo?: string }} options `relativeTo` is the folder a message names a file from.
 * @returns {Map<string, { key: string, code: string, lang: string, file: string, path: string, startLine: number, endLine: number }>}
 */
export function readSnippets({ files, relativeTo = process.cwd() }) {
  const snippets = new Map();
  const problems = [];
  const paths = new Set(files.map((file) => resolve(file)));
  for (const path of [...paths].sort()) {
    const file = relative(relativeTo, path).replaceAll('\\', '/');
    const open = [];
    const text = readFileSync(path, 'utf8');
    // A byte order mark is not part of the first line.
    const lines = (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).split(/\r\n|\r|\n/);
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      const begin = BEGIN.exec(trimmed);
      if (begin) {
        const key = begin[1];
        if (!KEY.test(key)) problems.push(`${file}:${index + 1}: "${key}" is not a snippet key (letters, digits, "_", "." and "-", starting and ending with a letter or digit)`);
        open.push({ key, startLine: index + 1, lines: [] });
      } else if (END.test(trimmed)) {
        const region = open.pop();
        if (!region) {
          problems.push(`${file}:${index + 1}: end marker without a begin marker`);
        } else if (snippets.has(region.key)) {
          const first = snippets.get(region.key);
          problems.push(`${file}:${region.startLine}: snippet "${region.key}" is already defined at ${first.file}:${first.startLine}`);
        } else {
          const code = render(region.lines);
          if (code === '') problems.push(`${file}:${region.startLine}: snippet "${region.key}" is empty`);
          snippets.set(region.key, { key: region.key, code, lang: extname(path).slice(1), file, path, startLine: region.startLine, endLine: index + 1 });
        }
      } else if (MALFORMED.test(trimmed)) {
        problems.push(`${file}:${index + 1}: malformed snippet marker "${trimmed}"`);
      } else {
        for (const region of open) region.lines.push(line);
      }
    });
    for (const region of open) problems.push(`${file}:${region.startLine}: snippet "${region.key}" has no end marker`);
  }
  if (problems.length > 0) throw new Error(`Snippet errors:\n  ${problems.join('\n  ')}`);
  return snippets;
}

const NO_SAMPLES =
  'No sample file defines a region: check the "samples" globs of site.config.json (default tests/**/*.cs), which are relative to the repository root.';

/** The sample for `key`, or an error that names the keys that exist. */
export function getSnippet(snippets, key, usedBy = 'a page') {
  const snippet = snippets.get(key);
  if (!snippet) {
    const defined = snippets.size > 0 ? `Defined: ${[...snippets.keys()].sort().join(', ')}` : NO_SAMPLES;
    throw new Error(`Snippet "${key}", which ${usedBy} uses, is not defined in the library's sample files. ${defined}`);
  }
  return snippet;
}

/** A hash of every sample: a value that changes when any sample does, for cache keys. */
export function snippetsDigest(snippets) {
  const hash = createHash('sha256');
  for (const key of [...snippets.keys()].sort()) hash.update(`${key}\0${snippets.get(key).code}\0`);
  return hash.digest('hex').slice(0, 16);
}
