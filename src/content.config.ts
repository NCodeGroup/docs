import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { docsSchema } from '@astrojs/starlight/schema';
import { z } from 'astro/zod';

// The pages of the library the build is for: scripts/site.mjs mounts its content folder at
// src/content/docs/, where Starlight expects its pages to be. This is Starlight's own loader with
// one more rule: a folder whose name starts with an underscore (_components, _assets) holds no
// pages, as a file whose name starts with one never did.
export const collections = {
  docs: defineCollection({
    loader: glob({ base: './src/content/docs', pattern: ['**/[^_]*.{md,mdx}', '!**/_*/**'] }),
    schema: docsSchema({
      extend: z.object({
        // Numbers the page's second-level headings in the margin, for a page that is a procedure.
        numbered: z.boolean().default(false),
      }),
    }),
  }),
};
