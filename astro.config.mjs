// Copyright © NCode Group
// SPDX-License-Identifier: Apache-2.0

// @ts-check
// The one Astro project every NCode library's documentation site is built with. It holds no
// library's content: scripts/site.mjs (or the reusable workflow) names a library through
// DOCS_LIBRARY and DOCS_CONTENT, mounts its content folder at src/content/docs/, and runs Astro.
import { realpathSync } from 'node:fs';
import { defineConfig } from 'astro/config';
import { satteri } from '@astrojs/markdown-satteri';
import starlight from '@astrojs/starlight';
import starlightLinksValidator from 'starlight-links-validator';
import { ncodeSite } from './src/integration.mjs';
import { findIncludedFiles, includesDigest } from './src/includes/files.mjs';
import {
  libraryPath,
  listPages,
  ownNotFoundPage,
  readCommit,
  readLastUpdated,
  resolveLibrary,
} from './src/library.mjs';
import { baseLinks } from './src/links/base-links.mjs';
import { checkBuiltLinks } from './src/links/built-links.mjs';
import { readSnippets } from './src/snippets/catalog.mjs';
import { snippetsPlugin, watchLibraryFiles } from './src/snippets/satteri.mjs';
import { stackedTables } from './src/tables/stacked-tables.mjs';

const library = resolveLibrary();
const { config } = library;

// The site's URL as it is served. The workflow passes SITE_URL from the repository's Pages settings,
// so a custom domain needs no change anywhere; a local build and a pull request build use the
// library's own default. One variable, because an empty base path is a valid value of its own.
const siteUrl = new URL(process.env.SITE_URL || config.siteUrl);
const base = siteUrl.pathname.replace(/\/$/, '') || '/';
const inBase = (path) => (base === '/' ? '' : base) + path;

// A page's file as its author knows it, for a message: the build reads a mounted copy.
const describePage = (file) => libraryPath(library, file);

// The library's samples: regions of its compiled tests, read once. A duplicate key, an unclosed
// region or a malformed marker stops the build here, before any page is read.
const snippets = readSnippets({ files: library.sampleFiles, relativeTo: library.root });

// The files the pages include with `file=<path>`, and the commit their captions link to. A block
// that names a file the library does not have stops the build when its page renders.
const pages = listPages(library);
const includeRoot = { root: library.root, realRoot: realpathSync(library.root) };
const included = findIncludedFiles(includeRoot, pages);
const { commit, reason } = readCommit(library);
if (!commit && reason && included.length > 0) {
  const message = `Source links name the branch ${config.repository.branch}: git could not read the commit of ${library.root}: ${reason}`;
  // A workflow command's data escapes "%" (and line breaks, which a first line has none of).
  console.warn(process.env.GITHUB_ACTIONS === 'true' ? `::warning::${message.replaceAll('%', '%25')}` : message);
}

export default defineConfig({
  site: siteUrl.origin,
  base,
  // With 'always', the build, the dev server and GitHub Pages agree on every page's URL.
  trailingSlash: 'always',
  outDir: process.env.DOCS_OUT || './dist',
  // The favicons, from the brand's {N} logo kit; a library's images are imported from its _assets folder.
  publicDir: './vendor/brand/logo/ncode/favicon',
  markdown: {
    processor: satteri({
      mdastPlugins: [
        snippetsPlugin(snippets, {
          describePage,
          includes: { library: includeRoot, repository: config.repository, commit, digest: includesDigest(included) },
        }),
      ],
      hastPlugins: [baseLinks(base, { describePage }), stackedTables()],
    }),
  },
  integrations: [
    watchLibraryFiles([...library.sampleFiles, ...included]),
    ncodeSite({
      title: config.title,
      product: config.product,
      mark: config.mark,
      version: config.version,
      repository: config.repository,
      social: config.social,
      contentPath: library.contentPath,
      notFoundPage: ownNotFoundPage(library),
      editLinks: config.editLinks,
      lastUpdated: config.lastUpdated,
      lastUpdatedByFile: config.lastUpdated ? readLastUpdated(library) : {},
    }),
    starlight({
      title: config.title,
      description: config.description,
      sidebar: config.sidebar,
      // Starlight adds the base path to `favicon`, and to nothing in `head`.
      favicon: '/favicon.svg',
      head: [
        { tag: 'link', attrs: { rel: 'icon', href: inBase('/favicon.ico'), sizes: '32x32' } },
        { tag: 'link', attrs: { rel: 'apple-touch-icon', href: inBase('/apple-touch-icon.png') } },
      ],
      // The brand's tokens, the typefaces they name and Starlight's own properties mapped onto them,
      // vendored and never edited here; then the stylesheet that restyles Starlight's markup.
      customCss: [
        './vendor/brand/tokens/tokens.css',
        './vendor/brand/css/fonts.css',
        './vendor/brand/css/starlight.css',
        './src/styles/theme.css',
      ],
      components: {
        SiteTitle: './src/components/overrides/SiteTitle.astro',
        SocialIcons: './src/components/overrides/SocialIcons.astro',
        PageTitle: './src/components/overrides/PageTitle.astro',
      },
      routeMiddleware: './src/route-data.ts',
      // The middleware sets both from the library's repository; see src/route-data.ts.
      lastUpdated: false,
      credits: false,
      // src/pages/404.astro renders the 404 page; Starlight's own route looks it up among the docs
      // pages and warns when there is none.
      disable404Route: true,
      // Fails the build on an internal link that leads nowhere, which is also how a link the
      // base-path plugin could not reach is caught.
      plugins: [starlightLinksValidator()],
    }),
    // After Starlight, so it reads the finished pages: nothing may link outside the base path.
    checkBuiltLinks(base),
  ],
});
