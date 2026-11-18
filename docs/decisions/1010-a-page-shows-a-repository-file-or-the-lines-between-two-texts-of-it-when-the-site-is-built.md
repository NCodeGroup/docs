# 1010. A page shows a repository file, or the lines between two texts of it, when the site is built

- **Status:** Accepted
- **Date:** 2026-11-18
- **Deciders:** NCode Group

## Context

A guide that holds a hand copy of a build file drifts from the file, and nothing notices. NCodeGroup/Buffers'
`ban-leaky-apis` guide copies the `ItemGroup` of its `Directory.Build.props`; the copy is right only until the file
changes ([NCodeGroup/Buffers#68](https://github.com/NCodeGroup/Buffers/issues/68)).

[ADR-1002](1002-a-page-includes-a-compiled-sample-by-its-key-when-the-site-is-built.md) includes only the regions of a
library's compiled samples, between marker comments, and rejects line ranges and Starlight's `<Code>` component with a
raw import. A build file is not a sample: it is not compiled by a test, and a toolchain's marker comments do not belong
in it (JSON has no comment at all).

## Decision

**A page holds no hand copy of a file of the library's repository. It names the file, and the lines it shows by their
text, in an empty fenced code block, and the build fills the block, titles it with the path, and puts a caption under
it that links those lines on GitHub at the commit the site was built from. A block the build cannot place stops the
build.**

1. A page includes a file with a fenced block whose info string starts with the language and carries `file=<path>`, and
   optionally `from="<text>"` and `to="<text>"`, such as
   `xml file=Directory.Build.props from="<ItemGroup Condition=" to="</ItemGroup>"`. A value is bare (no white space, no
   quote), or quoted with `"` or `'`. `from` and `to` match as a case-sensitive substring of one line. `from` is on
   exactly one line; `to` is the first line at or after the `from` line (or the first line, without `from`) that holds
   it, and on the `from` line it gives one line. Without `from` the block starts at the first line, and without `to` it
   runs to the end. `lines=` is refused, because a range shows other lines once the file changes. The rest of the info
   string (`title="…"`, `{4}`, `ins={…}`, `del={…}`, marked text, `wrap`) goes on to Expressive Code, and marked line
   numbers count from the first line shown. The language is required and is one Shiki highlights, or `txt`, `text`,
   `plaintext` or `plain`.
2. The path is relative to the library's repository root, with no leading `/`, `\` or drive, no backslash, and no
   empty, `.` or `..` segment. It names a file that exists, is at most 1 MiB, is UTF-8 text without U+0000, and is not
   empty. It is never inside `.git`, and its real path, after symbolic links, is under the library's real root.
   `bin`, `obj`, `node_modules` and `TestResults` are allowed.
3. The page shows the file's lines from the selected first to last, without the leading and trailing blank lines, and
   with the longest string of spaces and tabs that starts every non-blank line removed. Blank lines inside are kept.
   A selection of blank lines only stops the build.
4. The caption is a paragraph of class `ncode-source` that links `<repository url>/blob/<commit>/<path>`, with
   `#L<first>-L<last>` for several lines, `#L<n>` for one line and nothing for the whole file. Its label is the path,
   the lines shown and the commit's first seven characters, as in `Directory.Build.props, lines 7–10 at 589501c`.
   The commit is the library's `HEAD`; when git cannot read it, the caption names the branch, and the build warns once
   with the reason.
5. The build stops, naming the page and the path as written, on each of these: a block with no language or a language
   Shiki does not highlight; a block with code of its own; `snippet=` and `file=` in one block; `from=` or `to=` without
   `file=`; `lines=`; a name given twice; a quote never closed; an empty `from` or `to`; a path that breaks item 2; a
   `from` or `to` that is on no line, or a `from` that is on several, with the line numbers; a selection of blank
   lines only.
6. `astro.config.mjs` finds the included files once, before any page, with `findIncludedFiles`. `astro dev` restarts
   when one changes, because the files are watched with the samples, and a hash of their contents is part of the
   Markdown processor's configuration, so Astro's cache of rendered pages is stale when one changes. A file a page
   starts to include while the dev server runs is followed from the server's next start.

## Options considered

- **Copies typed into pages.** Rejected: nothing keeps them equal to the file.
- **`lines=` ranges.** Rejected: a range points at other lines as soon as the file changes, and still builds
  ([ADR-1002](1002-a-page-includes-a-compiled-sample-by-its-key-when-the-site-is-built.md) rejects it too).
- **Region markers in the included file.** Rejected: a build file's toolchain gives the markers no place, and JSON has
  no comment.
- **Starlight's `<Code>` with a `?raw` import.** Rejected: it shows a whole file, each include needs an import, and a
  part of a file still needs code to cut it out.
- **Text anchors, `from` and `to`** (chosen): the anchors are text the file already holds, a change to that text fails
  the build and names it, and no file is edited for the page's sake.

## Consequences

- A build file shown on a page cannot drift: the page shows the file as the commit holds it.
- An anchor is on one line. A `from` that is on several lines is refused, and the author gives longer text.
- An anchor whose text changes fails the build and names the page, the path and the text.
- A caption links the commit the site was built from. A pull request's build links the merge commit GitHub makes for
  it. An uncommitted edit shows on the page, and not at the link.
- A page is not readable on its own in the repository: its `file=` blocks are empty there.
- A library cannot include a file of another repository or a URL.

## References

- `src/includes/files.mjs`, `src/includes/code-block.mjs`, `src/library.mjs`, `astro.config.mjs`
- `test/includes.test.mjs`, `fixture/`
- [CONTRACT.md](../../CONTRACT.md): the syntax an author writes.
- [ADR-1002](1002-a-page-includes-a-compiled-sample-by-its-key-when-the-site-is-built.md): the samples a page includes.
- [#32](https://github.com/NCodeGroup/docs/issues/32)
- [NCodeGroup/Buffers#68](https://github.com/NCodeGroup/Buffers/issues/68)
