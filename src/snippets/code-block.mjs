// Copyright © NCode Group
// SPDX-License-Identifier: Apache-2.0

// Shared by the Markdown plugins: a fenced code block whose info string carries `snippet=<Key>`
// is filled with that sample from the library's sample files. The block itself stays empty in the page.
const REFERENCE = /(?:^|\s)snippet=(\S+)/;

/** @returns {{ value: string, meta: string | null } | undefined} */
export function fillCodeBlock(snippets, getSnippet, node, usedBy) {
  // A fence with no language reads `snippet=Key` as the language, and would be published as an
  // empty block: the first word of the info string is the language, whatever it says.
  if (/^snippet=/.test(node.lang ?? '')) {
    throw new Error(`${usedBy}: a code block with ${node.lang} needs its language first, as in \`\`\`cs ${node.lang}`);
  }
  const match = REFERENCE.exec(node.meta ?? '');
  if (!match) return undefined;
  if ((node.value ?? '').trim() !== '') {
    throw new Error(
      `${usedBy}: a code block with snippet=${match[1]} must be empty; its code comes from the library's sample files.`,
    );
  }
  const snippet = getSnippet(snippets, match[1], usedBy);
  if (node.lang && node.lang !== snippet.lang) {
    throw new Error(`${usedBy}: snippet=${match[1]} is ${snippet.lang}, but the code block says ${node.lang}.`);
  }
  const meta = node.meta.replace(match[0], ' ').trim();
  return { value: snippet.code, meta: meta === '' ? null : meta };
}
