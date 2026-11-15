# 1003. Links are written from the site root, and the build proves none leaves the base path

- **Status:** Accepted
- **Date:** 2026-11-15
- **Deciders:** NCode Group

## Context

A library's site is served under a base path, the repository's name, such as `/Buffers/`, and at the root of a domain
once the library has a custom one. Astro takes the base path as its `base` setting. Starlight adds it to the links it
makes itself: the navigation, the site title, its stylesheets and scripts. It adds it to nothing an author writes: a
Markdown link, an `href` in a page, a hero action or a `prev` or `next` in frontmatter is published as written
(`@astrojs/starlight` 0.42.11, tested 2026-11-15).

A link without the base path works on a local build at the root and is broken on the published site. A link written
with the base path works under that one base and breaks the day the site moves to another.

## Decision

**An author writes every internal link from the site's root, with a trailing slash and without the base path. The
build adds the base path, and fails when a built page links outside it or to nothing.**

1. An internal link is site-absolute: `/guides/derive-a-key/`, with a fragment `/guides/derive-a-key/#salt`. It is
   never relative and never starts with the base path. A link written with the base path stops the build, naming the
   page and the link as it is to be written.
2. The build adds the base path wherever an author can write a link as plain text (`src/links/base-links.mjs`,
   `src/route-data.ts`):
   - Markdown links and images;
   - in an `.mdx` page, `href` and `src` written as plain strings on `<a>`, `<img>`, `<LinkCard>` and `<LinkButton>`;
   - in a `.md` page, `href` of an `<a>` and `src` of an `<img>` written as HTML;
   - in frontmatter, the links of hero actions and of `prev` and `next`.
3. The link validator fails the build on a link to a page or a heading that does not exist, on a relative link and on
   a link without its trailing slash, in a page's body and frontmatter. It runs after item 2, so it also reports a
   link the build left without the base path.
4. After the build, every built page is read (`src/links/built-links.mjs`): the `href`, `src`, `srcset`, `action` and
   `poster` attributes of each of its tags. The build fails on a site-absolute URL that does not start with the base
   path, and on one the built site has no file for. This is the check that reaches what items 2 and 3 cannot: a link
   a component computes, a `link` of the sidebar, and HTML on other elements of a `.md` page.
5. A component that computes a link builds it from `import.meta.env.BASE_URL`.
6. `site: { url }` of a library's `site.config.json` gives the base path for a local build and a pull request build.
   A deploying run takes the URL from the repository's Pages settings instead, so a custom domain set there needs no
   change in the library.

## Options considered

- **Relative links.** Rejected: what a relative link means depends on the page's own URL and its trailing slash, it
  breaks when a page moves, and the link validator reports one instead of checking it.
- **Links written with the base path.** Rejected: every link changes when the site moves to a custom domain, and
  until then only the deploying build would notice a wrong one.
- **Adding the base path without checking the result.** Rejected: an attribute written as an expression and a link
  inside a component's properties are beyond a Markdown plugin, and each would be published broken.
- **The link validator alone.** Rejected: it reads a page's body and frontmatter, not the sidebar of
  `site.config.json` and not what a component renders.
- **Site-absolute links, a plugin that adds the base path, and a check of the built pages** (chosen).

## Consequences

- One page works under any base path and at the root of a domain. The tests build the fixture both ways, and a
  browser loads the built site under its base path and asks nothing outside it.
- A broken link fails a pull request's build, not a reader.
- At the root of a domain there is no base path to leave, so the first half of item 4 has nothing to report there;
  the build under a base path is the one that proves the links.
- A link shown as code is text in the built page and is not checked. A URL in a stylesheet, an inline script or an
  attribute other than the five of item 4 is not checked either.
- External links are published as written and are not checked.
- The plugin and the check are this repository's own code, written for Sätteri's plugin interface
  ([ADR-1000](1000-library-sites-are-built-with-astro-starlight-core-only.md)).

## References

- `src/links/base-links.mjs`, `src/links/built-links.mjs`, `src/route-data.ts`, `astro.config.mjs`
- `test/links.test.mjs`, `test/build.test.mjs`, `test/samples.test.mjs`, `test/browser.test.mjs`
- [CONTRACT.md](../../CONTRACT.md), section 5: where the base path is added, and where it is not.
- [Astro's `base` setting](https://docs.astro.build/en/reference/configuration-reference/#base)
- [starlight-links-validator](https://github.com/HiDeoo/starlight-links-validator)
