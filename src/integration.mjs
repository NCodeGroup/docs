// The Astro integration that hands the library's settings to the site's own code, and gives pages
// their import aliases:
//
//   virtual:ncode-docs/site     the settings components and the route middleware read
//   @ncode/docs/components      the components every NCode site shares (src/components/index.ts)
//   @site/components/<file>     the library's own components, <content folder>/_components/
//   @site/assets/<file>         the library's own images, <content folder>/_assets/
import { join } from 'node:path';
import { mountDirectory, toolchainRoot } from './library.mjs';

const VIRTUAL = 'virtual:ncode-docs/site';

export function ncodeSite(site) {
  return {
    name: 'ncode-docs-site',
    hooks: {
      'astro:config:setup': ({ updateConfig }) => {
        updateConfig({
          vite: {
            resolve: {
              alias: [
                { find: '@ncode/docs/components', replacement: join(toolchainRoot, 'src', 'components', 'index.ts') },
                { find: /^@site\/components\//, replacement: join(mountDirectory, '_components') + '/' },
                { find: /^@site\/assets\//, replacement: join(mountDirectory, '_assets') + '/' },
              ],
            },
            plugins: [
              {
                name: 'ncode-docs-site',
                resolveId: (id) => (id === VIRTUAL ? '\0' + VIRTUAL : undefined),
                load: (id) => (id === '\0' + VIRTUAL ? `export const site = ${JSON.stringify(site)};` : undefined),
              },
            ],
          },
        });
      },
    },
  };
}
