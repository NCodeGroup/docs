# 1005. Biome lints the Astro components without formatting them

- **Status:** Accepted
- **Date:** 2026-11-16
- **Deciders:** NCode Group
- **Amends:** project-template ADR-0201

## Context

The template's ADR-0201 makes `biome.json` name only JavaScript and TypeScript files. The six components in
`src/components/` and `fixture/docs/site/_components/ByteGrid.astro` hold code in their frontmatter, which that file
leaves unchecked.

Biome 2.6.7 (read 2026-11-16) has two ways to read an Astro file:

- Without HTML support it reads only the frontmatter. It reports 14 `noUnusedVariables` and `noUnusedImports`
  findings in those seven files, all false, for names that the markup uses.
- With `html.experimentalFullSupportEnabled` it reads the markup too and reports none. Its HTML formatter changes
  rendered text: in `src/components/overrides/SocialIcons.astro` it puts `{site.version}` on its own line after
  `<span class="sr-only">Version </span>`, which adds a space before the version, and it unindents every `<style>`
  block.

ADR-1000's rule 4 adds a package only for what every library's site needs. Biome checks this repository's code
instead.

## Decision

**Biome lints the Astro components, markup and frontmatter, and formats only the JavaScript and TypeScript files.**

1. `biome.json` adds `**/*.astro` to `files.includes` and sets
   `"html": { "experimentalFullSupportEnabled": true, "formatter": { "enabled": false } }`.
2. `.editorconfig` alone sets the Astro components' layout.
3. Biome is a devDependency pinned exactly. `.github/workflows/site.yml` installs with
   `npm ci --ignore-scripts --omit=dev`, so a library's build never gets it. ADR-1000's rule 4 governs the packages
   the site is built with; a tool for this repository's checks, like `playwright-core`, is a devDependency.

## Options considered

- **JavaScript and TypeScript only, as the template's file has it.** Rejected: the frontmatter goes unchecked.
- **Astro without HTML support.** Rejected: 14 false findings, each needing a `biome-ignore`.
- **Full HTML support with its formatter.** Rejected: it changes a page's rendered text.
- **Full HTML support without its formatter** (chosen): the markup and the frontmatter are read together, and the
  layout stays with `.editorconfig`.

## Consequences

- `npm run lint` checks 34 files, the seven components among them (measured 2026-11-16).
- The HTML support is experimental, so a Biome update can add findings. Its Dependabot pull request shows them in CI
  and fixes them there.
- When Biome's HTML formatter keeps a page's rendered text, a later record can turn it on.

## References

- `biome.json`, `package.json`, `.github/workflows/site.yml`
- [project-template ADR-0201](project-template/0201-biome-lints-and-formats-javascript-and-typescript.md)
- [ADR-1000](1000-library-sites-are-built-with-astro-starlight-core-only.md): the site generator.
- [Biome language support](https://biomejs.dev/internals/language-support/)
- [#10](https://github.com/NCodeGroup/docs/issues/10)
