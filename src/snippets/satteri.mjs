// Sätteri (Astro's default Markdown and MDX processor since Astro 7): the mdast plugin that fills
// `snippet=Key` code blocks, and the integration that makes `astro dev` follow the samples. The
// caller says how to name a page in a message, because the page the build reads is a mounted copy.
import { fileURLToPath } from 'node:url';
import { getSnippet, snippetsDigest } from './catalog.mjs';
import { fillCodeBlock } from './code-block.mjs';

/**
 * For `satteri({ mdastPlugins: [snippetsPlugin(snippets)] })`.
 * @param {Map<string, object>} snippets From `readSnippets`.
 * @param {{ describePage?: (file: string) => string }} [options] Names a page file in an error message.
 */
export function snippetsPlugin(snippets, { describePage = (file) => file } = {}) {
  return [
    // Astro caches each rendered Markdown page by the page's own content, and hashes its
    // config to decide when that cache is stale. A plugin object is part of the config, so
    // the samples' hash in it makes a changed sample clear the cache.
    { name: 'ncode-snippets-cache-key', samples: snippetsDigest(snippets) },
    ({ fileURL }) => ({
      name: 'ncode-snippets',
      code(node) {
        const filled = fillCodeBlock(snippets, getSnippet, node, fileURL ? describePage(fileURLToPath(fileURL)) : 'a page');
        return filled ? { ...node, ...filled } : undefined;
      },
    }),
  ];
}

/** An Astro integration: `astro dev` restarts when a file that holds a sample changes. */
export function watchSnippetSources(sources) {
  return {
    name: 'ncode-watch-snippet-sources',
    hooks: {
      'astro:config:setup': ({ addWatchFile }) => sources.forEach((source) => addWatchFile(source)),
      // The samples are outside the site's folder, so Vite does not watch them on its own.
      'astro:server:setup': ({ server }) => server.watcher.add(sources),
    },
  };
}
