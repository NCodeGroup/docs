// Copyright © NCode Group
// SPDX-License-Identifier: Apache-2.0

// A library page shows a file of the library's repository from an empty fenced block whose info
// string carries file=<path>, and optionally from="<text>" and to="<text>". This module reads that
// info string and selects the lines the page shows. Every failure is an error that names the page
// and the block's path, so the site build fails instead of publishing a wrong or missing file.

// One token of an info string: name=value, a quoted string, a brace group, or any other word.
const TOKEN = /([A-Za-z][\w-]*)=(?:"([^"]*)"|'([^']*)'|([^\s"']+))|"[^"]*"|'[^']*'|\{[^}]*\}|\S+/g;
const OWN_NAMES = new Set(['file', 'from', 'to', 'lines']);
// A token that opens a quote after one of this module's names, and so is one whose quote never closed.
const UNCLOSED = /^(file|from|to|lines)=(["'])/;
const LINE_BREAK = /\r\n|\r|\n/;
const BLANK = /^\s*$/;

/**
 * Reads the file reference of a code block's info string.
 *
 * @param {string} meta The block's language and meta text, as `txt file=BannedSymbols.txt`.
 * @param {string} page The page as the library has it, which names it in an error.
 * @returns {{ path: string | undefined, from: string | undefined, to: string | undefined, rest: string } | undefined}
 *   `undefined` when the string holds no `file=`, `from=`, `to=` or `lines=`; otherwise the
 *   path, the `from` and `to` texts, and every other token of the string joined with one space,
 *   which Expressive Code reads.
 */
export function parseFileReference(meta, page) {
  const taken = [];
  const unclosed = [];
  const rest = [];
  for (const match of meta.matchAll(TOKEN)) {
    const name = match[1];
    if (name !== undefined && OWN_NAMES.has(name)) {
      taken.push({ name, value: match[2] ?? match[3] ?? match[4] });
      continue;
    }
    const open = UNCLOSED.exec(match[0]);
    if (open) {
      unclosed.push({ name: open[1], quote: open[2] });
      continue;
    }
    rest.push(match[0]);
  }
  if (taken.length === 0 && unclosed.length === 0) return undefined;

  const fail = (message) => {
    throw new Error(`${page}: ${message}`);
  };
  const seen = new Set();
  for (const { name } of taken) {
    if (seen.has(name)) fail(`${name}= is given twice.`);
    seen.add(name);
  }
  if (unclosed.length > 0) {
    const { name, quote } = unclosed[0];
    fail(`${name}=${quote}… has no closing quote.`);
  }
  const value = (name) => taken.find((entry) => entry.name === name)?.value;
  const path = value('file');
  const from = value('from');
  const to = value('to');
  const lines = value('lines');
  if (from === '') fail('from="" names no text.');
  if (to === '') fail('to="" names no text.');
  if (lines !== undefined) {
    fail(
      `lines=${lines} is not supported: a line range shows other lines once the file changes. Name the first and last lines by their text, with from="…" and to="…".`,
    );
  }
  if (path === undefined) {
    fail('from= and to= select lines of the file that file= names; this code block has no file=.');
  }
  return { path, from, to, rest: rest.join(' ') };
}

/** `3`, `3 and 7`, `3, 7 and 9`. */
function listNumbers(numbers) {
  if (numbers.length < 2) return numbers.join('');
  return `${numbers.slice(0, -1).join(', ')} and ${numbers.at(-1)}`;
}

/** The longest string of spaces and tabs that starts every one of the lines. */
function commonIndent(lines) {
  let indent;
  for (const line of lines) {
    const own = /^[ \t]*/.exec(line)[0];
    if (indent === undefined) {
      indent = own;
      continue;
    }
    let length = 0;
    while (length < indent.length && length < own.length && indent[length] === own[length]) length++;
    indent = indent.slice(0, length);
  }
  return indent ?? '';
}

/**
 * Selects the lines of a file a page shows: from the line that holds `from` (or the first line) to
 * the first line from there that holds `to` (or the last line), without blank lines at either end,
 * and without the indentation every line shares.
 *
 * @param {string} text The file's text.
 * @param {{ path: string, from?: string, to?: string }} reference The block's file reference.
 * @param {string} page The page as the library has it, which names it in an error.
 * @returns {{ code: string, first: number, last: number, whole: boolean }} The text to show, the
 *   file's own 1-based numbers of the first and last lines shown, and whether it is the whole file.
 */
export function selectLines(text, { path, from, to }, page) {
  const fail = (message) => {
    throw new Error(`${page}: file=${path} ${message}`);
  };
  const lines = (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).split(LINE_BREAK);
  // A line break ends a line; it does not start an empty one.
  if (lines.length > 0 && lines.at(-1) === '') lines.pop();

  let start = 0;
  if (from !== undefined) {
    const found = [];
    lines.forEach((line, index) => {
      if (line.includes(from)) found.push(index + 1);
    });
    if (found.length === 0) fail(`from="${from}" is on no line of the file.`);
    if (found.length > 1) fail(`from="${from}" is on lines ${listNumbers(found)}; give text that is on one line only.`);
    start = found[0] - 1;
  }
  let end = lines.length - 1;
  if (to !== undefined) {
    let index = start;
    while (index < lines.length && !lines[index].includes(to)) index++;
    if (index === lines.length) fail(`to="${to}" is on no line from line ${start + 1} on.`);
    end = index;
  }

  let first = start;
  let last = end;
  while (first <= last && BLANK.test(lines[first])) first++;
  while (last >= first && BLANK.test(lines[last])) last--;
  if (first > last) fail(`shows only blank lines (lines ${start + 1}–${end + 1}).`);

  const shown = lines.slice(first, last + 1);
  const indent = commonIndent(shown.filter((line) => !BLANK.test(line)));
  const code = shown.map((line) => (BLANK.test(line) ? '' : line.slice(indent.length))).join('\n');
  return { code, first: first + 1, last: last + 1, whole: from === undefined && to === undefined };
}
