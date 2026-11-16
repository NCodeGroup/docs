# The content contract

What a library repository holds for its documentation site, and what the toolchain in this repository does with it.
Write pages against this file; [README.md](README.md) explains the setup, and the records in
[docs/decisions/](docs/decisions/README.md) explain why the rules are what they are.

A library is any repository whose site this toolchain builds. Paths below are relative to the library's repository
root unless they start with `src/`, `scripts/` or `schema/`, which are in this repository.

## 1. Files

```text
docs/site/                     the content folder (the workflow's content-path input names another)
  site.config.json             required: the site's settings (section 2)
  index.mdx                    the landing page, served at the site's root
  quick-start.mdx              a page, served at /quick-start/
  guides/derive-a-key.mdx      a page, served at /guides/derive-a-key/
  404.mdx                      optional: the page a missing URL gets
  _components/Diagram.astro    optional: the library's own components
  _assets/lifecycle.png        optional: the library's own images
tests/**/*.cs                  the sample files (the samples setting names other globs)
.github/workflows/docs.yml     the workflow that calls the toolchain (README.md)
```

- A page is an `.mdx` file. Its URL is its path under the content folder, lower-cased, without the extension, with a
  trailing slash. `index.mdx` in a folder is that folder's URL. A `.md` file also builds, as plain Markdown: it
  cannot import or use a component, and HTML written in it is published as written (section 5).
- A file or folder whose name starts with `_` is never a page. `_components/` and `_assets/` are the two such folders
  with a meaning.
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

The "last updated" date comes from the library's git history: `git log` for the content folder. A page shows a date
once its file is committed, and the date is that of the newest commit that changed the file. A page that is not
committed yet shows none, an edit that is not committed does not move the date, and a library folder that is not a
git repository shows no dates. The workflow checks out the library's full history for this; a shallow clone would
give every page the date of its one commit.

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

A slug is a page's path under the content folder without the extension. A folder's pages are ordered by each page's
`sidebar.order` frontmatter, then by file name. A `badge` is a string, or `{ "text", "variant" }` with variant `note`,
`tip`, `caution`, `danger`, `success` or `default`. A slug that names no page stops the build.

## 3. Frontmatter

| Key | Required | Meaning |
| --- | --- | --- |
| `title` | Yes | The page's heading, its browser title and its label in the navigation |
| `description` | No | Shown under the title as the lede, and used as the meta description |
| `numbered` | No | `true` numbers the page's second-level headings in the margin, for a procedure |
| `sidebar` | No | `order`, `label`, `badge`, `hidden`: the page's entry in an autogenerated group |
| `template` | No | `splash` for a landing page: no navigation, wide layout |
| `hero` | No | The landing page's `title`, `tagline`, `image` and `actions` |
| `tableOfContents` | No | `false`, or `{ minHeadingLevel, maxHeadingLevel }` |
| `prev`, `next` | No | `false`, or `{ link, label }`, to replace the previous and next page |
| `editUrl`, `lastUpdated` | No | `false` to leave one out; a URL or a date to replace it |
| `pagefind`, `draft` | No | `pagefind: false` leaves the page out of search; `draft: true` out of production builds |

These are Starlight's frontmatter keys plus `numbered`.
[Starlight's frontmatter reference](https://starlight.astro.build/reference/frontmatter/) has the full form of each
key and the ones this table leaves out. A key with a wrong value stops the build; an unknown key is ignored without a
word, so check its spelling.

## 4. Samples

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
- A `samples` glob names files under the repository root. A glob that matches a file outside it, through `..` or
  any other pattern, stops the build, naming the glob and the file.
- Folders named `bin`, `obj`, `node_modules`, `TestResults` and `.git` are never read, whatever the globs say.

To show the marker syntax itself on a page, put it in an ordinary fenced block: only the `snippet=` attribute makes a
block a sample.

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
| `@ncode/docs/components` | The shared components (below) |
| `@site/components/<file>` | The library's own component, `_components/<file>` |
| `@site/assets/<file>` | The library's own image, `_assets/<file>` |
| `astro:assets` | Astro's `Image` and `Picture` |

Nothing else. A page cannot import an npm package of the library's choosing, because the library has no manifest; a
library that needs one asks for it in this repository. `@astrojs/starlight/components` resolves too, but pages name
`@ncode/docs/components`, which re-exports it.

`@ncode/docs/components` exports Starlight's `Aside`, `Badge`, `Card`, `CardGrid`, `Code`, `FileTree`, `Icon`,
`LinkButton`, `LinkCard`, `Steps`, `TabItem` and `Tabs`, and three of this toolchain's own:

| Component | Use |
| --- | --- |
| `<Status state="success">Yes</Status>` | A lamp and a word. `state`: `on` (default), `off`, `success`, `warning`, `danger` |
| `<Readout>32 bytes</Readout>` | One value on a small screen |
| `<Braces>32 bytes</Braces>` | A value between the braces of the NCode mark |

Callouts need no import: `:::note`, `:::tip`, `:::caution` and `:::danger`, with an optional title, `:::tip[Title]`.

A library's own component is an `.astro` file in `_components/`. It may import from the same four places, styles
itself with the design tokens (`var(--color-screen)`, `var(--space-4)`, `var(--font-mono)`; never a colour of its
own), and puts the class `not-content` on its root element so the page's text styles stay off it. It ships no
client-side script that loads from another origin.

## 8. What fails the build

Each of these stops the build, in a pull request as on the default branch, with a message that names the file and
the key or the link:

1. `site.config.json` missing, not JSON, or not matching the schema; a `samples` glob that matches a file outside the
   repository.
2. A sample region that is never closed, a key defined twice, a malformed marker line, a key that is not a key, an
   empty region: named by sample file and line.
3. A page that uses `snippet=Key` for a key no sample file defines (the message lists the keys that exist), that puts
   code of its own in a `snippet=` block, whose block has no language, or whose block's language is not the sample's.
4. A link to a page or heading that does not exist, a relative link, a link without its trailing slash, a link
   written with the base path, and a site-absolute link the build could not put the base path on (section 5).
5. Frontmatter with a missing `title` or a wrong value; a `sidebar` slug that names no page.
6. An import or an image that does not resolve, or MDX that does not parse.

A message from Astro or one of its plugins names the file it read, which is the toolchain's copy of the content
folder: `src/content/docs/guides/x.mdx` there is `docs/site/guides/x.mdx` in the library. The link validator names a
page by its path under the content folder, and shows a link with the base path already added.

## 9. Building

```shell
node scripts/site.mjs build <library folder> [--content docs/site] [--site-url <url>] [--out <folder>]
node scripts/site.mjs dev <library folder> [--content docs/site] [--port 4321]
node scripts/site.mjs preview <library folder> [--content docs/site] [--port 4321]
```

`DOCS_LIBRARY`, `DOCS_CONTENT`, `SITE_URL` and `DOCS_OUT` are the same four values as environment variables; an
argument wins. The script copies the content folder into this toolchain at `src/content/docs/` (ignored by git,
replaced by the next run), so one checkout of the toolchain builds one library at a time: a second command started
while a build or a dev server runs in the same checkout stops with a message that names the first. It writes nothing
to the library.
