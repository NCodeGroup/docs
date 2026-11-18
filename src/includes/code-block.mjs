// Copyright © NCode Group
// SPDX-License-Identifier: Apache-2.0

// Shared by the Markdown plugins: an empty fenced code block whose info string carries
// `file=<path>` is filled with that file of the library's repository, or the lines of it that
// `from=` and `to=` select, and gets a caption that links those lines on GitHub at the commit the
// site was built from.
import { bundledLanguagesInfo } from 'shiki';
import { parseFileReference, readIncludedFile, selectLines } from './files.mjs';

// The languages a block can name: every one Shiki highlights, by id or alias, and plain text.
const KNOWN_LANGUAGES = new Set([
  ...bundledLanguagesInfo.flatMap((language) => [language.id, ...(language.aliases ?? [])]),
  'txt',
  'text',
  'plaintext',
  'plain',
]);
// A first word that is one of this module's attributes: the fence had no language.
const NO_LANGUAGE = /^(?:file|from|to|lines)=/;

/**
 * Fills a code block that names a file, and builds the caption that goes under it.
 *
 * @param {{ lang?: string | null, meta?: string | null, value?: string }} node The code block.
 * @param {string} page The page as the library has it, which names it in an error.
 * @param {{ library: { root: string, realRoot: string }, repository: { url: string, branch: string }, commit: string | undefined }} includes
 *   The library's root and its real path, the repository's URL and branch, and the commit the site is built from.
 * @returns {{ value: string, meta: string | null, caption: object } | undefined} The text and
 *   meta text the block takes and the caption node to put after it; `undefined` for a block that names no file.
 */
export function fillFileBlock(node, page, includes) {
  const fail = (message) => {
    throw new Error(`${page}: ${message}`);
  };
  // A fence with no language reads `file=<path>` as the language: the first word of the info
  // string is the language, whatever it says. The reference is parsed first, so its own failures win.
  if (NO_LANGUAGE.test(node.lang ?? '')) {
    const parsed = parseFileReference(`${node.lang} ${node.meta ?? ''}`, page);
    fail(`a code block with file=${parsed.path} needs its language first, as in \`\`\`txt file=${parsed.path}`);
  }
  const reference = parseFileReference(node.meta ?? '', page);
  if (reference === undefined) return undefined;
  if (/(?:^|\s)snippet=/.test(node.meta ?? '')) fail('a code block takes snippet= or file=, not both.');
  if ((node.value ?? '').trim() !== '') {
    fail(`a code block with file=${reference.path} must be empty; its text comes from the file.`);
  }
  if (!KNOWN_LANGUAGES.has(node.lang ?? '')) {
    fail(
      `file=${reference.path} says ${node.lang}, which is not a language the code blocks highlight; use txt for plain text.`,
    );
  }

  const { path, text } = readIncludedFile(includes.library, reference.path, page);
  const { code, first, last, whole } = selectLines(text, reference, page);

  const hasTitle = /(?:^|\s)title=/.test(reference.rest);
  const meta = [...(hasTitle ? [] : [`title="${path}"`]), ...(reference.rest === '' ? [] : [reference.rest])].join(' ');

  const { repository, commit } = includes;
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  const fragment = whole ? '' : first === last ? `#L${first}` : `#L${first}-L${last}`;
  const url = `${repository.url}/blob/${commit ?? repository.branch}/${encoded}${fragment}`;
  const shown = whole ? '' : first === last ? `, line ${first}` : `, lines ${first}–${last}`;
  const label = `${path}${shown} ${commit ? `at ${commit.slice(0, 7)}` : `on ${repository.branch}`}`;
  const caption = {
    type: 'paragraph',
    data: { hName: 'p', hProperties: { className: ['ncode-source'] } },
    children: [{ type: 'link', url, children: [{ type: 'text', value: label }] }],
  };
  return { value: code, meta: meta === '' ? null : meta, caption };
}
