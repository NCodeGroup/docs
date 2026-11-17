// Copyright © NCode Group
// SPDX-License-Identifier: Apache-2.0

import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { i18nLoader } from '@astrojs/starlight/loaders';
import { docsSchema, i18nSchema } from '@astrojs/starlight/schema';
import { z } from 'astro/zod';

const pageFields = z.object({
  // Numbers the page's second-level headings in the margin, for a page that is a procedure.
  numbered: z.boolean().default(false),
});

// The pages of the library the build is for: scripts/site.mjs mounts its content folder at
// src/content/docs/, where Starlight expects its pages to be. This is Starlight's own loader with
// one more rule: a folder whose name starts with an underscore (_components, _assets) holds no
// pages, as a file whose name starts with one never did. The 404 page at the root is no page of
// its own: the notFound collection below holds it.
export const collections = {
  docs: defineCollection({
    loader: glob({ base: './src/content/docs', pattern: ['**/[^_]*.{md,mdx}', '!**/_*/**', '!404.{md,mdx}'] }),
    schema: docsSchema({ extend: pageFields }),
  }),
  // The library's 404 page or the toolchain's (src/defaults/404.mdx, mounted by scripts/site.mjs
  // when the library has none), kept out of docs so Starlight builds no /404/ page from it;
  // src/pages/404.astro renders it.
  notFound: defineCollection({
    loader: glob({ base: './src/content/docs', pattern: '404.{md,mdx}' }),
    schema: docsSchema({ extend: pageFields }),
  }),
  // Starlight's UI strings, configured as its i18n guide does it. src/content/i18n/en.json changes
  // none of the English ones: Starlight reads this collection in every build, and Astro warns about
  // a collection with no entry.
  i18n: defineCollection({ loader: i18nLoader(), schema: i18nSchema() }),
};
