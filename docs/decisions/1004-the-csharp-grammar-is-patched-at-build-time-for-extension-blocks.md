# 1004. The C# grammar is patched at build time for extension blocks

- **Status:** Accepted
- **Date:** 2026-11-15
- **Deciders:** NCode Group

## Context

The libraries write their main APIs as C# 14 extension blocks: `extension<T>(Span<T> span) where T : unmanaged { … }`.
Starlight highlights code with Expressive Code, which uses Shiki, which bundles a TextMate grammar for C#. That
grammar has no rule for an extension block, so a page colours one wrongly (Shiki 4.6.0, measured 2026-11-15 on 27
extension block headers and 63 `public` members of one library's source files):

- `extension` is a keyword in none of the 27 headers, and a generic header gets no colour at all;
- inside a block the body is read as statements: 32 of the 63 `public` modifiers keep their keyword colour.

No text is lost, but the code a page is about is the code that is coloured wrongly.

Upstream has no rule either. The grammar comes from
[dotnet/csharp-tmLanguage](https://github.com/dotnet/csharp-tmLanguage) through VS Code and `tm-grammars`: Shiki
4.6.0 bundles the grammar of commit `c271930` (2026-08-04), the one VS Code ships. The upstream default branch, at
`61acf50` (2026-10-30), has no rule for extension blocks, no issue or pull request about them, and no releases (all
read 2026-11-15). Prism and highlight.js do not know the syntax either.

## Decision

**The build adds two TextMate rules for C# 14 extension blocks to a copy of Shiki's bundled C# grammar, a test guards
the patch against a Shiki update, and the patch is deleted when the bundled grammar passes that test without it.**

1. `src/highlighting/csharp-extension-blocks.mjs` exports `withExtensionBlocks`, which returns Shiki's C# language
   registration with two more rules, `extension-declaration` and `extension-receiver`, modelled on the grammar's own
   rules for `class` and `struct` declarations and included wherever a type declaration may appear. `ec.config.mjs`
   passes the result as Expressive Code's `shiki.langs`. The patched grammar keeps the name `csharp` and the aliases
   `cs` and `c#`.
2. The patch steps aside or stops the build, and never guesses. It leaves a grammar that already has a rule whose
   name contains `extension` untouched, and it throws when one of the nine rules it builds on is missing.
3. `shiki` is a direct dependency pinned to the version Astro and Starlight resolve, so the grammar that is patched is
   the one the highlighter uses. Dependabot moves it with them in one pull request.
4. `test/highlighting.test.mjs` is the guard. It checks the scopes the patched grammar gives an extension block,
   checks that the lockfile holds one version of `shiki`, and checks the colours of an extension block in a built
   page of the fixture.
5. The patch is removed when Shiki bundles a C# grammar with its own rule for extension blocks. The sign is the
   first test: when it passes with `csharp` in place of `withExtensionBlocks(csharp)`, delete the module, the option
   in `ec.config.mjs` and the first two tests, and keep the built-page test. When upstream's rule gives other scopes,
   the patch has already stepped aside (item 2) and the test shows the difference to adopt.

## Options considered

- **No fix.** Rejected: extension blocks are the shape of the APIs the pages document.
- **An injection grammar.** Rejected: listed alone it does nothing in Starlight, which loads `csharp` after the
  `langs` option, and Shiki wires an injection only into a grammar loaded with it; it also fires inside method bodies
  (tested 2026-11-15).
- **A Shiki transformer or decorations.** Rejected: both run after the tokens are made, so they would have to parse
  the block's members themselves and know every theme's colours.
- **A vendored copy of the whole patched grammar.** Rejected: about 100 kB of JSON that is stale after each Shiki
  update.
- **Waiting for upstream.** Rejected: there is no issue, pull request or release schedule, and VS Code, `tm-grammars`
  and Shiki each have to take a fix after it lands.
- **Two rules added to the bundled grammar when the site is built** (chosen): 92 lines, nothing sent to the browser.

## Consequences

- All 27 headers are scoped as declarations, the members of a block get the scopes they have in a class, and no other
  C# changes: 0 of 74,051 tokens of the comparison corpus differ (measured 2026-11-15).
- A Shiki update that renames a rule the patch builds on fails the build, and one that changes behaviour fails the
  guard. Both are fixed in the pull request that brings the update.
- Two forms are known to be read wrongly. A bare call `extension(path);` at the top level of a sample, outside any
  method, is coloured as a block header. A header whose `(` is on the line after `extension<T>` falls back to the
  unpatched colours.
- `u8` and `field` stay plain, and `allows` and `scoped` keep the scopes upstream gives them. They are separate gaps
  of the upstream grammar.
- The rule belongs upstream. It is not reported there (2026-11-15).

## References

- `src/highlighting/csharp-extension-blocks.mjs`, `ec.config.mjs`, `test/highlighting.test.mjs`, `package.json`
- [C# 14 extension members](https://github.com/dotnet/csharplang/blob/68b7855d1189437a6ca4e6ee948f70c5afb7833c/proposals/csharp-14.0/extensions.md)
- [dotnet/csharp-tmLanguage](https://github.com/dotnet/csharp-tmLanguage), commits
  [`c271930`](https://github.com/dotnet/csharp-tmLanguage/commit/c2719309e91d2e26be21fce0ecaaca86c7b48ce4) and
  [`61acf50`](https://github.com/dotnet/csharp-tmLanguage/commit/61acf50cb1c7fcac8097249983dddfba56023608)
- [Shiki: loading custom languages](https://shiki.style/guide/load-lang)
- [Expressive Code: syntax highlighting](https://expressive-code.com/key-features/syntax-highlighting/)
- [ADR-1000](1000-library-sites-are-built-with-astro-starlight-core-only.md): the site generator.
