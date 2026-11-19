# The content contract

What a library repository holds for its documentation site, and what the toolchain in this repository does with it.
Write pages against this file; [README.md](README.md) explains the setup, and the records in
[docs/decisions/](docs/decisions/README.md) explain why the rules are what they are.

A library is any repository whose site this toolchain builds. Paths below are relative to the library's repository
root unless they start with `src/`, `scripts/` or `schema/`, which are in this repository.

## 1. Files

```text
docs/site/                                the content folder (the workflow's content-path input names another)
  site.config.json                        required: the site's settings (section 2)
  index.mdx                               the landing page, served at the site's root
  quick-start.mdx                         a page, served at /quick-start/
  guides/derive-a-key.mdx                 a page, served at /guides/derive-a-key/
  404.mdx                                 optional: the page a missing URL gets (or 404.md)
  _components/Diagram.astro               optional: the library's own components
  _assets/lifecycle.png                   optional: the library's own images
tests/**/*.cs                             the sample files (the samples setting names other globs)
Directory.Build.props, BannedSymbols.txt  any file of the repository a page shows (section 4)
.github/workflows/docs.yml                the workflow that calls the toolchain (README.md)
```

- A page is an `.mdx` file. Its URL is its path under the content folder, lower-cased, without the extension, with a
  trailing slash. `index.mdx` in a folder is that folder's URL. A `.md` file also builds, as plain Markdown: it
  cannot import or use a component, and HTML written in it is published as written (section 5).
- A file or folder whose name starts with `_` is never a page. `_components/` and `_assets/` are the two such folders
  with a meaning.
- `404.mdx`, or `404.md`, at the root of the content folder is the page a missing URL gets, served as `/404.html`.
  A content folder with both fails the build. It is no page of its own: it has no `/404/` URL, no edit link and no
  "last updated" date, search leaves it out, and a sidebar slug cannot name it. A library without one gets the
  toolchain's page: "Page not found", the header's search box and a link to the site's start.
- `site.config.json`, dotfiles and `node_modules` in the content folder are not part of the site.
- The library holds no `package.json`, no lockfile and no Astro or Starlight configuration.
- Avoid a folder name the repository's `.gitignore` ignores (`release/`, `debug/`, `packages/`, `publish/`, `log/` in
  the .NET template's): `git check-ignore -v <path>` says whether a new page will be committed.

## 2. `site.config.json`

JSON, checked against `schema/site.config.schema.json` before anything is built. An unknown key, a missing key or a
wrong value stops the build with a message that names the key. For editor support, start the file with
`"$schema": "https://raw.githubusercontent.com/NCodeGroup/docs/main/schema/site.config.schema.json"`.

| Key | Required | Meaning |
| --- | --- | --- |
| `title` | Yes | The site's name: browser titles, search, link previews. For a library, its package name |
| `description` | Yes | One sentence: the meta description of a page that has none |
| `repository.url` | Yes | The repository's URL, no trailing slash: the header's link and every edit link |
| `repository.branch` | No | The default branch, which edit links open. Default `main` |
| `site.url` | Yes | The site's URL with its base path, no trailing slash, such as `https://ncodegroup.github.io/Buffers` |
| `sidebar` | Yes | The navigation: groups, in the order shown (below) |
| `product` | No | The name beside the mark in the header, such as `Buffers`. Default: `title` |
| `mark` | No | `ncode` (default) or `ncode-identity`: which lockup the header shows |
| `version` | No | The label on the header's readout, such as `v5`; at most 16 characters |
| `social` | No | The header's links, each `{ "label", "href" }`. Default: one, `GitHub`, to the repository |
| `samples` | No | Globs of the files that hold sample regions, under the repository root. Default `["tests/**/*.cs"]` |
| `editLinks` | No | Whether each page links to its source. Default `true` |
| `lastUpdated` | No | Whether each page shows the date of the last commit that changed it. Default `true` |
| `requiredHeadings` | No | Headings the pages a glob names must have, in order (below). Default: none |

The "last updated" date comes from the library's git history: `git log` for the content folder. A page shows a date
once its file is committed, and the date is that of the newest commit that changed the file. A page that is not
committed yet shows none, an edit that is not committed does not move the date, and a library folder that is not a
git repository shows no dates. The workflow checks out the library's full history for this; a shallow clone would
give every page the date of its one commit. When the folder is in a repository but `git log` fails, because git is
not installed, the repository belongs to another user, or its `.git` file points to a folder that is gone, no page
shows a date and the build prints a warning with the folder and git's message, as an annotation in GitHub Actions.
The build still passes.

`site.url` is a fallback. The workflow sets the `SITE_URL` environment variable from the repository's Pages settings
on a deploying run, and that value wins; a pull request build and a local build use `site.url`. The base path is the
path of whichever URL is used: `/Buffers` for the example above, `/` for a custom domain.

### `sidebar`

An array of groups. A group is `{ "label", "items" }`, with optional `"collapsed": true` and `"badge"`. An item is one
of:

| Item | Example | Shows |
| --- | --- | --- |
| A page, by slug | `"guides/derive-a-key"` | The page's title |
| A page with a label | `{ "slug": "reference/api", "label": "API" }` | The label |
| A link | `{ "label": "Changelog", "link": "https://…" }` | A site-absolute path or an absolute URL |
| A folder | `{ "autogenerate": { "directory": "guides" } }` | Every page of the folder |
| A group | `{ "label": "Advanced", "items": [ … ] }` | A nested group |

A slug is a page's path under the content folder without the extension. The landing page's slug is `index`:
`{ "slug": "index", "label": "Overview" }` lists it. A folder's pages are ordered by each page's
`sidebar.order` frontmatter, then by file name. A `badge` is a string, or `{ "text", "variant" }` with variant `note`,
`tip`, `caution`, `danger`, `success` or `default`. A slug that names no page stops the build.

### requiredHeadings

An array of rules, for a library whose pages of one kind keep one skeleton:

```json
"requiredHeadings": [
  { "pages": ["guides/*"], "headings": ["## The usual code", "## Checklist"], "except": ["guides/review-checklist"] },
  { "pages": ["guides/ban-leaky-apis"], "headings": ["## Check your work"] }
]
```

| Field | Required | Meaning |
| --- | --- | --- |
| `pages` | Yes | At least one glob of page slugs: the pages the rule covers |
| `headings` | Yes | At least one heading: `##` to `######`, a space, and the text a reader sees |
| `except` | No | At least one slug of a page the rule leaves out |

- A slug is a page's path under the content folder without the extension, lower-cased, as in the sidebar:
  `guides/derive-a-key`. A glob is matched against the slug: `*` stands for any characters but `/`, `?` for one
  character but `/`, and `**` for any number of folders, so `guides/*` covers the pages directly in `guides/` and
  `guides/**` every page below it. Every page of the content folder has a slug, whether or not the sidebar lists it;
  the 404 page has none.
- A covered page has every heading of the rule, and their first appearances come in the listed order. Other headings
  may come between them. A heading is matched by its level and its text, exactly and case-sensitively, as the page
  shows it: `## Checklist` is not `### Checklist` or `## checklist`.
- A heading written in a fenced code block, rendered by a component or written as HTML does not count. A heading
  written in Markdown inside a component's children does.
- Rules are independent: a page may be covered by several, and each checks its own headings. `except` leaves a page out
  of its own rule only.
- The build stops, naming the page, the rule and `site.config.json`, on a covered page that lacks a heading (the
  message says to add it, or to add the page's slug to the rule's `except`) and on a covered page whose headings
  are out of order. It stops before the pages are built on a rule with a glob that matches no page, on an `except`
  that is not a page the rule's globs match, and on a heading a rule lists twice. When several of these are wrong, the
  one message lists each.

## 3. Frontmatter

| Key | Required | Meaning |
| --- | --- | --- |
| `title` | Yes | The page's heading, its browser title and its label in the navigation |
| `description` | No | Shown under the title as the lede, and used as the meta description |
| `numbered` | No | `true` numbers the page's second-level headings in the margin, for a procedure |
| `sidebar` | No | `order`, `label`, `badge`, `hidden`: the page's entry in an autogenerated group |
| `template` | No | `splash` for a page with no navigation and a wide layout, such as a landing page the sidebar does not list. A landing page that the sidebar lists, or that a reader returns to, keeps the default template, with `tableOfContents: false`, so the sidebar and a phone's menu stay; beside the sidebar its hero is one column until the content column is 50rem wide |
| `hero` | No | The landing page's `title`, `tagline`, `image` and `actions` |
| `tableOfContents` | No | `false`, or `{ minHeadingLevel, maxHeadingLevel }` |
| `prev`, `next` | No | `false`, or `{ link, label }`, to replace the previous and next page |
| `editUrl`, `lastUpdated` | No | `false` to leave one out; a URL or a date to replace it |
| `pagefind`, `draft` | No | `pagefind: false` leaves the page out of search; `draft: true` out of production builds |

These are Starlight's frontmatter keys plus `numbered`.
[Starlight's frontmatter reference](https://starlight.astro.build/reference/frontmatter/) has the full form of each
key and the ones this table leaves out. A key with a wrong value stops the build; an unknown key is ignored without a
word, so check its spelling.

## 4. Samples and repository files

### Samples

A page never holds a copy of library code that must compile. It includes a region of a sample file by key:

````mdx
```cs snippet=QuickStart
```

```cs snippet=QuickStart title="Signatures.cs" {4} ins={7-8}
```
````

The fence is empty; its language, `cs`, comes first; `snippet=Key` names the region. The key is written without
quotes: `snippet=QuickStart`. In `snippet="QuickStart"` the quotes are read as part of the key, which then names no
region and stops the build. A fence with no language before `snippet=Key` stops the build.

Everything else in the info string is passed on to the code block: `title="…"`, marked lines `{4}` or `{1, 4-6}`,
`ins={…}`, `del={…}`, `"marked text"` and `wrap`. Line numbers and collapsed sections are not installed. In the
sample file:

```cs
// begin-snippet: QuickStart
using var keyOwner = BufferFactory.Rent(32, isSensitive: true, out Span<byte> key);
// end-snippet
```

- The marker lines are exactly `// begin-snippet: Key` and `// end-snippet`, alone on their line apart from
  indentation. Nothing follows the key.
- A key is letters, digits, `_`, `.` and `-`, starting and ending with a letter or digit. Use PascalCase. Keys are
  unique across every sample file.
- The page shows the region as MarkdownSnippets would write it into a README: marker lines dropped, the first line's
  indentation removed from every line, runs of blank lines collapsed to one, trailing blank lines trimmed.
- Regions may nest; an inner region's marker lines are dropped from the outer one.
- No other comment line starts with `// begin-snippet` or `// end-snippet`, in any case or spacing: it is reported as
  a malformed marker. The same text inside a line of code, such as in a string, is left alone.
- A tab in a sample is shown as two spaces; indent sample files with spaces, as `.editorconfig` says.
- `#region` is not a sample marker.
- A `samples` glob names files under the repository root. Each file it matches is checked by its real path, with
  every symbolic link on its path followed, against the root's real path: a file that `..`, another pattern or a
  symbolic link puts outside the repository stops the build, naming the glob and the file, and so does a symbolic
  link that leads nowhere or around in a loop. A file reached through symbolic links that stay inside the repository
  is read like any file, and a root reached through a symbolic link, such as a checkout under a linked folder,
  builds.
- `*` and `**` never descend into a folder that is a symbolic link, so such a folder is read only where a glob
  writes out its path, such as `tests/shared/*.cs` or `tests/shared/**/*.cs`.
- Only symbolic links are followed: a hard link, or a folder mounted inside the repository, is read where it
  appears. A git checkout holds neither.
- Folders named `bin`, `obj`, `node_modules`, `TestResults` and `.git` are never read, whatever the globs say: a file
  in one is left out, also where a symbolic link leads into the folder, and a symbolic link in one is never
  followed, so it cannot stop the build.

To show the marker syntax itself on a page, put it in an ordinary fenced block: only the `snippet=` attribute makes a
block a sample.

### Repository files

A page never holds a hand copy of a file of the library's repository either. It names the file, and the lines it
shows by their text, in an empty fenced block, and the build fills the block, titles it with the path, and puts a
caption under it that links those lines on GitHub:

````mdx
```txt file=BannedSymbols.txt
```

```xml file=Directory.Build.props from="<ItemGroup Condition=" to="</ItemGroup>"
```
````

| Info string | Shows |
| --- | --- |
| `txt file=BannedSymbols.txt` | The whole file |
| `txt file=BannedSymbols.txt to="P:System.Text.Encoding.Default;"` | From the first line to the line that holds the `to` text |
| `xml file=Directory.Build.props from="<ItemGroup Condition=" to="</ItemGroup>"` | From the line that holds `from` to the first line from there that holds `to` |
| `yaml file=.github/workflows/docs.yml from="jobs:"` | From the line that holds `from` to the end |

- The fence is empty; its language comes first. The language is one that the code blocks highlight (a language's name
  or alias in Shiki's list, written as Shiki spells it, in lower case), or `txt`, `text`, `plaintext` or `plain` for
  plain text.
- A value is bare, with no white space and no quote (`file=BannedSymbols.txt`), or quoted with `"`, holding no `"`,
  or with `'`, holding no `'`. A value that holds white space is quoted. `from` and `to` are written once each.
- `from` and `to` match as a case-sensitive substring of one line. `from` is on exactly one line of the file: when its
  text is on several, give longer text. `to` is the first line at or after the `from` line, or at or after the first
  line without `from`, that holds it; when it is on the `from` line, the page shows that one line. Without `from` the
  page starts at the first line, and without `to` it runs to the end of the file.
- `lines=` does not exist. A range of line numbers shows other lines once the file changes, and the build still
  passes; the text a page names is text the file holds, and a change to it stops the build, naming it.
- The path is relative to the library's repository root: no leading `/` or `\`, no drive, no backslash, and no empty,
  `.` or `..` segment. It names a file that exists and is neither a folder nor in `.git`, whatever the letter case of
  the folder's name; its real path, with every symbolic link followed, is under the repository's real path, and a link
  that leads out stops the build. `bin`, `obj`, `node_modules` and `TestResults` are allowed here, unlike in a
  `samples` glob. The file is at most 1 MiB, is UTF-8 text without a null character, and is not empty.
- The page shows the file's lines from the first to the last selected, without the blank lines at either end, and
  with the longest run of spaces and tabs that starts every non-blank line removed from each of them. Blank lines
  inside are kept, and a selection of blank lines only stops the build.
- Everything else in the info string is passed on to the code block: `title="…"`, marked lines `{4}`, `ins={…}`,
  `del={…}`, `"marked text"` and `wrap`. The line numbers of marked lines count from the first line shown. A block
  with no `title=` is titled with the path as written.
- The caption is a link under the block, `<repository url>/blob/<commit>/<path>`, with `#L7-L10` for lines 7 to 10 of
  the file, `#L4` for line 4 alone and no fragment for the whole file; the numbers are the file's own, not the
  block's. Its label is the path, the lines and the commit's first seven characters, such as
  `Directory.Build.props, lines 7–10 at 589501c`, `src/X.cs, line 4 at 589501c` and `BannedSymbols.txt at 589501c`.
- The commit is the library's `HEAD` when the site is built. A pull request's build links the merge commit GitHub
  makes for it, which is the commit its checkout is at. An edit that is not committed shows on the page and not at the
  link. When git cannot read the commit, the caption links the default branch, labelled `on main` where the branch is
  `main`, and the build prints a warning with the reason once, as an annotation in GitHub Actions; the build still
  passes.
- A block takes `snippet=` or `file=`, not both, and `from=` and `to=` only with `file=`.

`file=` is for build files, banned-symbol lists and data files, which no test compiles. Code that must compile stays
a sample, so the page shows what the library's tests ran.

## 5. Links

Write every internal link site-absolute, from the site's root, with a trailing slash: `/guides/derive-a-key/`, with a
fragment `/guides/derive-a-key/#salt`. Never write the base path (`/Buffers/…`) and never a relative link (`../x/`).
The build adds the base path, so the same page works under `/Buffers/` and at the root of a custom domain. A link
that already starts with the base path stops the build, naming the page and the link as it should be written. A link
to another site on the same host, such as another library's, is a full URL: `https://ncodegroup.github.io/Other/`.

| Where the link is written | Base path added |
| --- | --- |
| Markdown link or image: `[text](/x/)`, `![alt](/x.png)` | Yes |
| In an `.mdx` page: `<a href="/x/">`, `<img src="/x.png">`, `<LinkCard href="/x/">`, `<LinkButton href="/x/">` as plain text | Yes |
| In a `.md` page: `<a href="/x/">` and `<img src="/x.png">` written as HTML | Yes |
| Frontmatter: `hero.actions[].link`, `prev.link`, `next.link` | Yes |
| `sidebar` in `site.config.json`: slugs and `link` | Yes |
| An attribute written as an expression, `href={…}`, or a link inside another component's props | No: the build fails |
| In a `.md` page: a link on any other HTML element, such as `<video poster="/x.png">` | No: the build fails |
| HTML inside `hero.tagline` or `banner.content` | No: the build fails |

A link the build cannot fix is not published: after the build the `href`, `src`, `srcset`, `action` and `poster`
attributes of every tag of every built page are read, and a site-absolute URL without the base path stops the build,
naming the page and the link. A link shown as code, such as `<a href="/x/">` in a code block or a line of code, is
text and is not checked. A component that must compute a link builds it from
`import.meta.env.BASE_URL`, which ends with a slash: `` href={`${import.meta.env.BASE_URL}guides/x/`} ``.

A link to a page or a heading that does not exist stops the build, wherever it is written: the link validator reports
one in a page's body or frontmatter by page and line, and a check of the built pages reports any other, such as a
`link` of the sidebar, by the built pages that have it. A heading (`#salt`) is checked in a page's body and
frontmatter only. External links (`https://…`) are left as written and are not checked.

## 6. Images and other assets

An image lives in `_assets/` and is referenced through the alias, or by a path relative to the page's own file
(`./_assets/x.png` from a page in the content folder, `../_assets/x.png` from a page one folder down). Both are
optimized and served from under the base path, and an image that does not exist stops the build. A landing page's
`hero.image` is `{ file: ./_assets/x.png, alt: … }`, relative in the same way:

```mdx
![A vault is rented, used, then disposed](../_assets/lifecycle.png)
![The same image](@site/assets/lifecycle.png)

import { Image } from 'astro:assets';
import lifecycle from '@site/assets/lifecycle.png';

<Image src={lifecycle} alt="A vault is rented, used, then disposed" width={360} />
```

There is no folder of files served as they are: a library cannot add a file at a fixed URL (a download, a `CNAME`).
The favicons are the toolchain's.

## 7. What a page may import

| Import | What it is |
| --- | --- |
| `@ncodegroup/docs/components` | The shared components (below) |
| `@site/components/<file>` | The library's own component, `_components/<file>` |
| `@site/assets/<file>` | The library's own image, `_assets/<file>` |
| `astro:assets` | Astro's `Image` and `Picture` |

Nothing else. A page cannot import an npm package of the library's choosing, because the library has no manifest; a
library that needs one asks for it in this repository. `@astrojs/starlight/components` resolves too, but pages name
`@ncodegroup/docs/components`, which re-exports it.

`@ncodegroup/docs/components` exports Starlight's `Aside`, `Badge`, `Card`, `CardGrid`, `Code`, `FileTree`, `Icon`,
`LinkButton`, `LinkCard`, `Steps`, `TabItem` and `Tabs`, and three of this toolchain's own:

| Component | Use |
| --- | --- |
| `<Status state="success">Yes</Status>` | A lamp and a word. `state`: `on` (default), `off`, `success`, `warning`, `danger` |
| `<Readout>32 bytes</Readout>` | One value on a small screen |
| `<Braces>32 bytes</Braces>` | A value between the braces of the NCode mark |

Callouts need no import: `:::note`, `:::tip`, `:::caution` and `:::danger`, with an optional title, `:::tip[Title]`.

A table written in Markdown needs no import either. In a window narrower than 40rem (640 px), such as a phone's, it
is shown as a stack of rows: each cell on a line of its own, under its column's name, which the build copies from the
head cell. Keep head cells short, since each is repeated on every row there; a column whose head cell is empty, such
as a column of row names, shows its cells without a name. A table written as HTML, or one a library's component
renders, is not stacked.

A Markdown table must fit the content column. Its cells wrap, code in them included, so most tables do. One that still
cannot fit, because it has too many columns or long words in them, scrolls sideways inside the column, so a published
page stays readable, but the layout check (section 8) fails it: give it fewer columns, or lay its data out as a card
per entry, as below. A table kept wide on purpose is a library's own component whose root is marked `data-scrolls`.

A library's own component is an `.astro` file in `_components/`. It may import from the same four places, styles
itself with the brand's public tokens, each prefixed `--nc-`: the colour roles, the type roles, the font families,
elevation and the measures (`var(--nc-color-screen)`, `font: var(--nc-type-value)`, `var(--nc-space-4)`). It never
states a colour of its own, and never reads a step of a colour ramp or of the type scale, such as `--nc-blue-600` or
`--nc-text-sm`, which a brand release may change. It puts the class `not-content` on its root element so the page's
text styles stay off it. It ships no client-side script that loads from another origin. The build reads every `.astro`
and `.css` file under `_components/` before it starts, and stops on a `--nc-` token the brand does not define or on a
step of a ramp or scale, naming the file and the token.

A page's content column is as wide as the window leaves it, beside the sidebar and, from 72rem (1152 px), the "On this
page" panel. Measured on the fixture in headless Chromium, 2026-11-18:

| Window | Content column |
| --- | --- |
| 1440 px | about 44rem (710 px), beside the "On this page" panel |
| 1280 px | about 36rem (586 px), beside the panel |
| 1024 px | about 38rem (614 px); the panel is a menu in the header |
| 390 px | about 20rem (332 px) |

The column is never wider than 50rem (800 px), which a page without the panel (`tableOfContents: false`) reaches from
72rem up. Design a component for a column of about 36rem. Lay out data with more than three or four columns, or with
long identifiers, as a card per entry with its fields labelled, not as a wide table. Never give an element a
`min-width` wider than the column.

A component's elements fit the page's content column. An element that must scroll sideways by design, such as a long
strip of bytes, scrolls inside the column, with `overflow-x: auto`, and carries the attribute `data-scrolls`. The
layout check (section 8) then measures its box, which still fits the column, but not its content. A code block
scrolls the same way, unmarked. A Markdown table is not exempt: it must fit.

## 8. What fails the build

Each of these stops the build, in a pull request as on the default branch, with a message that names the file and
the key or the link:

1. `site.config.json` missing, not JSON, or not matching the schema; a `samples` glob that matches a file that a
   pattern or a symbolic link puts outside the repository, or a symbolic link that leads nowhere or around in a loop
   (section 4).
2. A sample region that is never closed, a key defined twice, a malformed marker line, a key that is not a key, an
   empty region: named by sample file and line.
3. A page that uses `snippet=Key` for a key no sample file defines (the message lists the keys that exist), that puts
   code of its own in a `snippet=` block, whose block has no language, or whose block's language is not the sample's.
   A page with a `file=` block that has no language or a language the code blocks do not highlight, that holds code of
   its own, that also has `snippet=`, or that has `from=` or `to=` without `file=`; a block with `lines=`, a name
   given twice, a quote never closed, or an empty `from` or `to`; a path that is empty, absolute, holds a backslash or
   an empty, `.` or `..` segment, or is inside `.git`; a file that does not exist, is a folder, leads out of the
   library through a symbolic link or cannot be read, is over 1 MiB, is not UTF-8 text, or is empty; a `from` or `to`
   that is on no line, a `from` that is on several, and a selection of blank lines only (section 4).
4. A link to a page or heading that does not exist, a relative link, a link without its trailing slash, a link
   written with the base path, and a site-absolute link the build could not put the base path on (section 5).
5. Frontmatter with a missing `title` or a wrong value; a `sidebar` slug that names no page.
6. An import or an image that does not resolve, or MDX that does not parse.
7. A page without a heading a `requiredHeadings` rule requires, or with them out of order; a rule whose glob matches
   no page, whose exception is not a page it covers, or that lists a heading twice (section 2).
8. A library's component (an `.astro` or `.css` file under `_components/`) that reads a `--nc-` token the brand does
   not define, or a step of a colour ramp or of the type scale (section 7).

After the build, the workflow loads every page in Google Chrome at 1440, 1280, 1024 and 390 px. It fails on an element
of a page's content that extends past its content column, and on a scroll container in it that hides part of its
content sideways (a code block and an element marked `data-scrolls` excepted). A Markdown table too wide for the
column fails, though it scrolls inside it: the message names it by the head cells that have text,
`Markdown table "<first column> | <second> | <third> | …"`, and says to lay it out as a card per entry or give it fewer
columns. The message gives each page as its source file, the width and the element, with the heading it is under.

A message from Astro or one of its plugins names the file it read, which is the toolchain's copy of the content
folder: `src/content/docs/guides/x.mdx` there is `docs/site/guides/x.mdx` in the library. The link validator names a
page by its path under the content folder, and shows a link with the base path already added.

## 9. Building

```shell
node scripts/site.mjs build <library folder> [--content docs/site] [--site-url <url>] [--out <folder>]
node scripts/site.mjs dev <library folder> [--content docs/site] [--port 4321]
node scripts/site.mjs preview <library folder> [--content docs/site] [--port 4321]
node scripts/site.mjs check <library folder> [--content docs/site] [--site-url <url>] [--out <folder>] [--browser <path>]
```

`check` loads the site `build` wrote and checks it as the workflow does: give it the same `--content`, `--site-url`
and `--out`. Its browser is `--browser` or `DOCS_BROWSER`, else `CHROME_BIN`, else the Chromium `npm run browser`
installs; a Chromium-based browser such as Google Chrome or Microsoft Edge.

`DOCS_LIBRARY`, `DOCS_CONTENT`, `SITE_URL`, `DOCS_OUT` and `DOCS_BROWSER` are the same five values as environment
variables; an argument wins. The script copies the content folder into this toolchain at `src/content/docs/` (ignored
by git, replaced by the next run), so one checkout of the toolchain builds one library at a time: a second command
started while a build or a dev server runs in the same checkout stops with a message that names the first. It writes
nothing to the library.

The built site goes to `dist/` in this toolchain unless `--out` names another folder. A folder outside the toolchain
whose path starts with the toolchain's, such as `../docs-site` beside a toolchain at `../docs`, stops `build` and
`preview` before anything is built: Astro would take it for a folder inside the toolchain, and that build could not
find the toolchain's packages.

The dev server (`npm run dev`) follows edits to pages, sample files and the files pages include; a file a page starts
including, and a page a `requiredHeadings` rule starts covering, are followed from the server's next start.
