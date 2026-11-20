// Copyright © NCode Group
// SPDX-License-Identifier: Apache-2.0

// The Astro integration that hands the library's settings to the site's own code, and gives pages
// their import aliases:
//
//   virtual:ncode-docs/site     the settings components and the route middleware read
//   @ncodegroup/docs/components      the components every NCode site shares (src/components/index.ts)
//   @site/components/<file>     the library's own components, <content folder>/_components/
//   @site/assets/<file>         the library's own images, <content folder>/_assets/
import { join } from 'node:path';
import { mountPath, toolchainRoot } from './library.mjs';

const VIRTUAL = 'virtual:ncode-docs/site';

/**
 * The site's code reads the mount through the virtual module, not by importing library.mjs: the
 * middleware is bundled and runs from the build's output folder, where library.mjs would not find
 * the schema it reads when it loads. `mountFolder` is the content folder inside the run's folder.
 */
export function ncodeSite(site, { mountFolder }) {
  const settings = { ...site, mount: `${mountPath}/` };
  return {
    name: 'ncode-docs-site',
    hooks: {
      'astro:config:setup': ({ updateConfig, injectRoute }) => {
        // The run's root has no src/pages/, so the 404 page is injected from the toolchain (ADR-1006).
        injectRoute({ pattern: '/404', entrypoint: join(toolchainRoot, 'src', 'pages', '404.astro') });
        updateConfig({
          vite: {
            resolve: {
              alias: [
                {
                  find: '@ncodegroup/docs/components',
                  replacement: join(toolchainRoot, 'src', 'components', 'index.ts'),
                },
                { find: /^@site\/components\//, replacement: `${join(mountFolder, '_components')}/` },
                { find: /^@site\/assets\//, replacement: `${join(mountFolder, '_assets')}/` },
              ],
            },
            plugins: [
              {
                name: 'ncode-docs-site',
                resolveId: (id) => (id === VIRTUAL ? `\0${VIRTUAL}` : undefined),
                load: (id) => (id === `\0${VIRTUAL}` ? `export const site = ${JSON.stringify(settings)};` : undefined),
              },
            ],
          },
        });
      },
    },
  };
}
