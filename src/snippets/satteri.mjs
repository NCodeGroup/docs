// Copyright © NCode Group
// SPDX-License-Identifier: Apache-2.0

// Sätteri (Astro's default Markdown and MDX processor since Astro 7): the mdast plugin that fills
// `snippet=Key` and `file=<path>` code blocks, and the integration that makes `astro dev` follow the
// files they read. The caller says how to name a page in a message, because the page the build reads
// is a mounted copy.
import { fileURLToPath } from 'node:url';
import { getSnippet, snippetsDigest } from './catalog.mjs';
import { fillCodeBlock } from './code-block.mjs';
import { fillFileBlock } from '../includes/code-block.mjs';

/**
 * For `satteri({ mdastPlugins: [snippetsPlugin(snippets, { includes })] })`.
 * @param {Map<string, object>} snippets From `readSnippets`.
 * @param {object} options
 * @param {(file: string) => string} [options.describePage] Names a page file in an error message.
 * @param {{ library: { root: string, realRoot: string }, repository: { url: string, branch: string }, commit: string | undefined, digest: string }} options.includes
 *   What `file=` blocks need: the library's root and real path, its repository, the commit the site
 *   is built from, and the digest of the files the pages include.
 */
export function snippetsPlugin(snippets, { describePage = (file) => file, includes }) {
  return [
    // Astro caches each rendered Markdown page by the page's own content, and hashes its
    // config to decide when that cache is stale. A plugin object is part of the config, so
    // the samples' and the included files' hashes in it make a changed sample or file clear the cache.
    { name: 'ncode-snippets-cache-key', samples: snippetsDigest(snippets), files: includes.digest },
    ({ fileURL }) => ({
      name: 'ncode-snippets',
      code(node, context) {
        const page = fileURL ? describePage(fileURLToPath(fileURL)) : 'a page';
        const included = fillFileBlock(node, page, includes);
        if (included) {
          context.insertAfter(node, included.caption);
          return { ...node, value: included.value, meta: included.meta };
        }
        const filled = fillCodeBlock(snippets, getSnippet, node, page);
        return filled ? { ...node, ...filled } : undefined;
      },
    }),
  ];
}

/** An Astro integration: `astro dev` restarts when a sample file or a file a page includes changes. */
export function watchLibraryFiles(files) {
  return {
    name: 'ncode-watch-library-files',
    hooks: {
      'astro:config:setup': ({ addWatchFile }) => {
        for (const file of files) addWatchFile(file);
      },
      // The files are outside the site's folder, so Vite does not watch them on its own.
      'astro:server:setup': ({ server }) => server.watcher.add(files),
    },
  };
}
