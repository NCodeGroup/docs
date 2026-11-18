# 1012. The build fails a library component that reads a token the brand does not offer

- **Status:** Accepted
- **Date:** 2026-11-18
- **Deciders:** NCode Group

## Context

[CONTRACT.md](../../CONTRACT.md) section 7 says a library's own component styles itself with the brand's public tokens
and never reads a step of a colour ramp or of the type scale. The brand's ADR-1002 lets any release change those steps,
so a component that reads one breaks when a release changes it.

`test/vendor.test.mjs` checks the toolchain's own files and the fixture's, but no check runs on a library's components.
A custom property that nothing defines makes the declaration that reads it invalid at computed-value time, so the
component renders without that declaration, and nothing reports it.
[ADR-1008](1008-the-brand-is-vendored-from-an-attested-release-and-the-theme-restyles-only-starlights-markup.md) vendors
the brand and restyles only Starlight's markup, so a library's components are the one place the toolchain does not
control which tokens are read.

## Decision

**The build reads the `.astro` and `.css` files of a library's `_components/` folder before it starts, and stops on a
`--nc-` token the brand does not define or on a step of a colour ramp or of the type scale.**

1. `scripts/site.mjs` and `astro.config.mjs` check the components before Astro starts, as they check
   `requiredHeadings`.
2. The files checked are every `.astro` and `.css` file under `<content folder>/_components/`, walked as the pages are
   (no link is followed, and names that start with `.` and `node_modules` are skipped), sorted by path. A library with
   no `_components/` folder has nothing to check.
3. A read is a `var(<name>`, with or without a fallback. Only names that start with `--nc-` are checked; a component
   may read Starlight's `--sl-` properties and its own.
4. The names the brand offers are those defined in `vendor/brand/tokens/tokens.css`, `vendor/brand/css/starlight.css`
   and `src/styles/theme.css` of the toolchain, plus those the file itself defines.
5. A primitive is a name of a colour ramp step (`--nc-blue-600`) or of a type scale step (`--nc-text-sm`), by the
   pattern `test/vendor.test.mjs` uses. A primitive is reported as one even when the brand defines it.
6. A name is reported once per file, in the order of its first read, with the file as the library has it
   (`docs/site/_components/ByteGrid.astro`). A primitive gives
   `<path> reads <name>, a step of the brand's colour ramps or type scale, which a brand release may change; read a colour role or a type role instead.`
   and an undefined name gives `<path> reads <name>, which the brand does not define.`
7. With one problem the message is that problem alone; with several, it is
   `The library's components read custom properties the brand does not offer:` and each problem on its own line after
   two spaces.

## Options considered

- **Leave it to review.** Rejected: a reviewer does not see a token a release removes, and a dropped declaration
  changes no output a diff shows.
- **A warning.** Rejected: a component that renders without its styling is the failure the check exists to prevent.
- **A stylelint rule in each library.** Rejected: every library writes and maintains its own rule, and it does not
  know the tokens of the brand release the toolchain vendors.
- **A check in the site build** (chosen): the check knows the tokens of the release the build uses, and runs on every
  build and on every start of the dev server.

## Consequences

- A component's styling cannot silently drop a token the brand does not offer.
- A brand release that removes a public token fails the library's next build, naming the file and the token.
- A component cannot read a step of a ramp or scale, so a release can change one without breaking a library.
- A token read only through an inline `style` in a page or an `.mdx` file is not checked.
- A component edited while `npm run dev` runs is checked from the server's next start.

## References

- [ADR-1008](1008-the-brand-is-vendored-from-an-attested-release-and-the-theme-restyles-only-starlights-markup.md)
- [CONTRACT.md](../../CONTRACT.md) section 7: the rule for a library's components.
- `src/brand/tokens.mjs`, `astro.config.mjs`, `scripts/site.mjs`
- `test/tokens.test.mjs`, `test/vendor.test.mjs`
