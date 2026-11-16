# 1002. A page includes a compiled sample by its key when the site is built

- **Status:** Accepted
- **Date:** 2026-11-15
- **Deciders:** NCode Group

## Context

A code sample typed into a page drifts from the API it shows, and nothing notices. The libraries already keep their
README samples as regions of compiled tests, marked `// begin-snippet: Key` and `// end-snippet`, which the
MarkdownSnippets tool copies into the READMEs. A site's pages need the same samples, and two facts rule out the same
tool for them:

- MarkdownSnippets puts `<!-- snippet: Key -->` comments around the code it copies, and MDX rejects an HTML comment:
  the build of such a page stops with "Unexpected character `!`" (MarkdownSnippets.Tool 29.0.0 with Astro 7.4.11,
  tested 2026-11-15).
- A copied sample is a committed copy. It is right only while a check outside the site's build keeps it so.

Starlight has no way to include a region of a source file
([ADR-1000](1000-library-sites-are-built-with-astro-starlight-core-only.md)). Astro also caches each rendered page by
the page's own text, and a sample lives in another file.

## Decision

**A page holds no copy of code that must compile. It names a region of a sample file by key, in an empty fenced code
block, and the build fills the block. A sample the build cannot place stops the build.**

1. A sample is a region of a file the library's `samples` globs match (`tests/**/*.cs` when `site.config.json` names
   none), between a line `// begin-snippet: Key` and a line `// end-snippet`. The markers are the ones
   MarkdownSnippets reads, so one region can serve a README and a page.
2. A page includes it with a fenced block whose info string starts with the language and carries `snippet=Key`, such
   as `cs snippet=QuickStart`. The rest of the info string goes on to the code block.
3. The page shows the region as MarkdownSnippets renders it: marker lines dropped, the first line's indentation
   removed from every line, runs of blank lines collapsed, trailing blank lines trimmed.
4. The build stops, naming the sample file and line or the page, and the key, on each of these:
   - a key defined twice, in one file or across files;
   - a region that is never closed, and an end marker without a begin marker;
   - a marker comment in any other spelling, case or spacing;
   - a key that is not letters, digits, `_`, `.` and `-`, starting and ending with a letter or digit;
   - an empty region;
   - a page that names a key no sample file defines, with the keys that exist in the message;
   - a `snippet=` block that holds code of its own, has no language, or names another language than the sample's.
5. The sample files are read once, before any page, in `scripts/site.mjs` and again in `astro.config.mjs`, so a wrong
   sample file stops the build with one message before Astro starts.
6. Every build is a full build: `scripts/site.mjs` runs `astro build --force`, and a hash of all samples is part of
   the Markdown processor's configuration, so a changed sample also invalidates Astro's cache of rendered pages.
   `astro dev` restarts when a sample file changes.

## Options considered

- **Samples typed into pages.** Rejected: nothing compiles them.
- **MarkdownSnippets copying into the pages.** Rejected: MDX rejects its markers, and every use is a committed copy.
- **Starlight's `<Code>` component with a file imported as text.** Rejected: it shows a whole file, the page needs an
  import for each sample, and a region still needs code to cut it out.
- **Line ranges of a file** (`file.cs#L10-L20`). Rejected: a range points at other lines as soon as the file changes,
  and still builds.
- **A warning for a sample the build cannot place.** Rejected: a published page with a missing or wrong sample is the
  failure this decision exists to prevent.
- **A build-time include by key that fails the build** (chosen).

## Consequences

- What a page shows is code that compiled, and ran when the region is inside a test.
- A page is not readable on its own in the repository: its code blocks are empty there, and the site shows the code.
- Keys share one space across all sample files of a library, and a rename of a key is a change to every page that
  uses it. The build names each page that still uses the old key.
- The reader is about 170 lines of this repository's own code with no dependency (`src/snippets/`), and the tests
  break a copy of the fixture in each way item 4 lists.
- A build cannot reuse Astro's cache of rendered pages. The fixture's seven pages build in about two seconds
  (measured 2026-11-15).

## References

- `src/snippets/catalog.mjs`, `src/snippets/code-block.mjs`, `src/snippets/satteri.mjs`, `scripts/site.mjs`
- `test/samples.test.mjs`, `fixture/tests/`
- [CONTRACT.md](../../CONTRACT.md), section 4: the syntax an author writes.
- [MarkdownSnippets](https://github.com/SimonCropp/MarkdownSnippets)
