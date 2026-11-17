# 1006. The toolchain renders the 404 page, and supplies one when a library has none

- **Status:** Accepted
- **Date:** 2026-11-16
- **Deciders:** NCode Group

## Context

Starlight 0.42.11's 404 route calls `getEntry('docs', '404')`. Under Astro 7.4.11 a missing entry logs
`[WARN] [content] Entry docs → 404 was not found.` in every build of a library without a `404.mdx`, and the page is
Starlight's fallback, titled "404".

A `404.mdx` in the `docs` collection is also a docs page, so Starlight's `[...slug]` route asks for `/404` too, and
Astro logs `Could not render /404 from route /[...slug] as it conflicts with higher priority route /404`.

Both were read 2026-11-16.

## Decision

**Starlight's 404 route is off, and `src/pages/404.astro` renders the 404 page through `StarlightPage`.**

1. The page is the one entry of the `notFound` collection: the library's `404.mdx` or `404.md` at the root of its
   content folder, or else `src/defaults/404.mdx`, which `scripts/site.mjs` mounts in its place. The `docs` collection
   leaves both names out at its root. A content folder with both fails the build, because the two would be one entry
   and the page that renders would depend on the loader's order.
2. The default page is "Page not found" with a link to the site's start. Its search box is the header's, because a
   second search in the body would repeat the search dialog's element ids and its Ctrl+K shortcut.
3. `StarlightPage` validates the frontmatter again, so the route turns each hero action's parsed `icon` back into the
   name or the `<svg>` an author writes.
4. The route middleware names the page by the library's file, `site.notFoundPage`.

## Options considered

- **Starlight's route, with the toolchain's page mounted into `docs`.** Rejected: the `[...slug]` route then builds
  `/404` too, and Astro warns about the conflict.
- **A 404 entry marked `draft`.** Rejected: every 404 page shows Starlight's draft notice.
- **`StarlightPage` with the raw frontmatter of a collection without a schema.** Rejected: a hero image is no
  imported image, and a wrong key's message names no file.
- **A route of the toolchain's own over a `notFound` collection** (chosen): one render path serves the library's page
  and the toolchain's, and the docs schema checks both.

## Consequences

- No build warns about the 404 page.
- One render path serves both cases.
- A Starlight update that parses another frontmatter field differently fails `test/not-found.test.mjs`.
- The page has no `/404/` URL, and a sidebar slug cannot name it.

## References

- `src/pages/404.astro`, `src/defaults/404.mdx`, `src/content.config.ts`, `scripts/site.mjs`, `CONTRACT.md`
- [ADR-1000](1000-library-sites-are-built-with-astro-starlight-core-only.md): the site generator.
- [#6](https://github.com/NCodeGroup/docs/issues/6)
