// Copyright © NCode Group
// SPDX-License-Identifier: Apache-2.0

// The file include: reading a code block's file reference and selecting the lines it shows.
import assert from 'node:assert/strict';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fillFileBlock } from '../src/includes/code-block.mjs';
import {
  findIncludedFiles,
  includesDigest,
  parseFileReference,
  readIncludedFile,
  resolveIncludedFile,
  selectLines,
} from '../src/includes/files.mjs';
import { build, failingBuild, fixture, page as pageBody, work, withLinks } from './helpers.mjs';

const page = 'docs/site/guides/x.mdx';
const rejects = (meta, message) =>
  assert.throws(() => parseFileReference(meta, page), { message: `${page}: ${message}` });
const selects = (text, reference, message) =>
  assert.throws(() => selectLines(text, reference, page), { message: `${page}: ${message}` });

describe('the file include, read', () => {
  it('leaves a block without a file reference alone', () => {
    assert.equal(parseFileReference('csharp title="x.cs" {2}', page), undefined);
    assert.equal(parseFileReference('', page), undefined);
  });

  it('reads a whole-file reference', () => {
    assert.deepEqual(parseFileReference('txt file=BannedSymbols.txt', page), {
      path: 'BannedSymbols.txt',
      from: undefined,
      to: undefined,
      rest: 'txt',
    });
  });

  it('reads a quoted from that holds = and <', () => {
    assert.deepEqual(
      parseFileReference('xml file=Directory.Build.props from="<ItemGroup Condition=" to="</ItemGroup>"', page),
      { path: 'Directory.Build.props', from: '<ItemGroup Condition=', to: '</ItemGroup>', rest: 'xml' },
    );
  });

  it('reads single quotes that hold double quotes', () => {
    assert.deepEqual(parseFileReference(`txt file=a.txt from='say "hi"' to='"bye"'`, page), {
      path: 'a.txt',
      from: 'say "hi"',
      to: '"bye"',
      rest: 'txt',
    });
  });

  it('keeps the other tokens for Expressive Code', () => {
    const reference = parseFileReference('txt file=a.txt title="from=x" {2} wrap "marked text"', page);
    assert.equal(reference.path, 'a.txt');
    assert.equal(reference.from, undefined);
    assert.equal(reference.rest, 'txt title="from=x" {2} wrap "marked text"');
  });

  it('reads a language that is itself the file name', () => {
    assert.equal(parseFileReference('file=a.txt', page).path, 'a.txt');
  });

  it('reads a name written with no value as an empty value', () => {
    assert.deepEqual(parseFileReference('file=', page), { path: '', from: undefined, to: undefined, rest: '' });
    assert.equal(parseFileReference('txt file= from=x', page).path, '');
  });

  it('refuses an empty from, to or lines written with no value', () => {
    rejects('txt file=a.txt from=', 'from="" names no text.');
    rejects('txt file=a.txt to=', 'to="" names no text.');
    rejects(
      'txt file=a.txt lines=',
      'lines= is not supported: a line range shows other lines once the file changes. Name the first and last lines by their text, with from="…" and to="…".',
    );
  });

  it('still refuses a quote that is never closed after a name', () => {
    rejects('txt file="a', 'file="… has no closing quote.');
  });

  it('keeps a title with no value for Expressive Code', () => {
    const reference = parseFileReference('txt title= file=a.txt', page);
    assert.equal(reference.path, 'a.txt');
    assert.equal(reference.rest, 'txt title=');
  });

  it('refuses a name given twice', () => {
    rejects('txt file=a.txt file=b.txt', 'file= is given twice.');
    rejects('txt file=a.txt from=x from=y to=z to=w', 'from= is given twice.');
  });

  it('refuses a quote that is never closed', () => {
    rejects('txt file=a.txt from="abc', 'from="… has no closing quote.');
    rejects(`txt file='a.txt`, `file='… has no closing quote.`);
  });

  it('refuses an empty from or to', () => {
    rejects('txt file=a.txt from=""', 'from="" names no text.');
    rejects("txt file=a.txt to=''", 'to="" names no text.');
  });

  it('refuses lines=', () => {
    rejects(
      'txt file=a.txt lines=3-5',
      'lines=3-5 is not supported: a line range shows other lines once the file changes. Name the first and last lines by their text, with from="…" and to="…".',
    );
  });

  it('refuses from= or to= without file=', () => {
    const message = 'from= and to= select lines of the file that file= names; this code block has no file=.';
    rejects('txt from=x', message);
    rejects('txt to=x', message);
  });

  it('reports the failures in the order the decision lists them', () => {
    rejects('txt from=x from=y lines=3', 'from= is given twice.');
    rejects('txt to="x lines=3', 'to="… has no closing quote.');
    rejects('txt from="" to=""', 'from="" names no text.');
    rejects('txt to="" lines=3', 'to="" names no text.');
    rejects(
      'txt lines=3 from=x',
      'lines=3 is not supported: a line range shows other lines once the file changes. Name the first and last lines by their text, with from="…" and to="…".',
    );
  });
});

describe('the file include, selected', () => {
  const text = ['alpha', '  one', '    two', '  end', 'beta', '  one', '  end', ''].join('\n');

  it('shows the whole file without its trailing newline', () => {
    assert.deepEqual(selectLines('a\nb\n', { path: 'a.txt' }, page), { code: 'a\nb', first: 1, last: 2, whole: true });
  });

  it('shows from the first line to the line that holds to', () => {
    assert.deepEqual(selectLines(text, { path: 'a.txt', to: 'two' }, page), {
      code: 'alpha\n  one\n    two',
      first: 1,
      last: 3,
      whole: false,
    });
  });

  it('shows from the line that holds from to the end', () => {
    assert.deepEqual(selectLines(text, { path: 'a.txt', from: 'beta' }, page), {
      code: 'beta\n  one\n  end',
      first: 5,
      last: 7,
      whole: false,
    });
  });

  it('ends at the first to after from when to repeats', () => {
    const selection = selectLines(text, { path: 'a.txt', from: 'beta', to: 'end' }, page);
    assert.equal(selection.code, 'beta\n  one\n  end');
    assert.deepEqual([selection.first, selection.last], [5, 7]);
    const early = selectLines(text, { path: 'a.txt', from: 'alpha', to: 'end' }, page);
    assert.deepEqual([early.first, early.last], [1, 4]);
  });

  it('shows one line when to is on the from line', () => {
    const selection = selectLines(text, { path: 'a.txt', from: 'two', to: 'two' }, page);
    assert.deepEqual(selection, { code: 'two', first: 3, last: 3, whole: false });
  });

  it('removes the indentation a nested selection shares', () => {
    const selection = selectLines(text, { path: 'a.txt', from: 'two', to: 'end' }, page);
    assert.equal(selection.code, '  two\nend');
  });

  it('removes a shared tab indentation, empties blank lines and drops blank ends', () => {
    const selection = selectLines('x\n\n\t\ta\n  \n\t\t\tb\n\n\ny\n', { path: 'a.txt', from: 'a', to: 'b' }, page);
    assert.deepEqual(selection, { code: 'a\n\n\tb', first: 3, last: 5, whole: false });
    assert.equal(selectLines('\n\n  a\n\n  b\n\n', { path: 'a.txt' }, page).code, 'a\n\nb');
  });

  it('removes only the indentation every line shares, tab for tab and space for space', () => {
    assert.equal(selectLines('\t a\n\tb\n', { path: 'a.txt' }, page).code, ' a\nb');
    assert.equal(selectLines(' \ta\n  b\n', { path: 'a.txt' }, page).code, '\ta\n b');
  });

  it('splits on CRLF, CR and LF and drops a byte order mark', () => {
    assert.equal(selectLines('\uFEFFa\r\nb\rc\nd\r\n', { path: 'a.txt' }, page).code, 'a\nb\nc\nd');
    assert.deepEqual(selectLines('\uFEFFa\r\nb', { path: 'a.txt', from: 'a' }, page).first, 1);
  });

  it('refuses a from on no line', () => {
    selects(text, { path: 'a.txt', from: 'gamma' }, 'file=a.txt from="gamma" is on no line of the file.');
  });

  it('refuses a from on several lines', () => {
    selects(
      'x\ny\nx\ny\nx\n',
      { path: 'a.txt', from: 'x' },
      'file=a.txt from="x" is on lines 1, 3 and 5; give text that is on one line only.',
    );
    selects(
      'x\ny\nx\n',
      { path: 'a.txt', from: 'x' },
      'file=a.txt from="x" is on lines 1 and 3; give text that is on one line only.',
    );
  });

  it('refuses a to on no line, from line 1 or from the from line', () => {
    selects(text, { path: 'a.txt', to: 'gamma' }, 'file=a.txt to="gamma" is on no line from line 1 on.');
    selects(text, { path: 'a.txt', from: 'beta', to: 'alpha' }, 'file=a.txt to="alpha" is on no line from line 5 on.');
  });

  it('refuses a selection of only blank lines', () => {
    selects(' \n\n\t\n', { path: 'a.txt' }, 'file=a.txt shows only blank lines (lines 1–3).');
    selects('a\n \n\t\nb\n', { path: 'a.txt', from: ' ', to: '\t' }, 'file=a.txt shows only blank lines (lines 2–3).');
  });
});

// A library of its own under .work/includes/<name>, empty, with the real path of its root.
function libraryNamed(name) {
  const root = join(work, 'includes', name);
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  return { root, realRoot: realpathSync(root) };
}
const put = (library, path, content) => {
  const file = join(library.root, ...path.split('/'));
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, content);
  return file;
};
const resolves = (library, path, message) =>
  assert.throws(() => resolveIncludedFile(library, path, page), { message: `${page}: ${message}` });
const reads = (library, path, message) =>
  assert.throws(() => readIncludedFile(library, path, page), { message: `${page}: ${message}` });
const BAD_PATH = (path) =>
  `file=${path} must be a path from the repository root, such as Directory.Build.props: no leading "/", "\\" or drive, no backslash, and no empty, "." or ".." segment.`;

describe('the file include, found', () => {
  it('refuses a path that is not from the repository root', () => {
    const library = libraryNamed('bad path');
    for (const path of [
      '',
      '/a.txt',
      '\\a.txt',
      'C:/a.txt',
      'c:a.txt',
      'a\\b.txt',
      'a//b.txt',
      './a.txt',
      'a/./b.txt',
      '../a.txt',
      'a/../b.txt',
      'a/',
    ]) {
      resolves(library, path, BAD_PATH(path));
    }
  });

  it('refuses a file inside .git', () => {
    const library = libraryNamed('inside git');
    put(library, '.git/config', 'x');
    put(library, 'sub/.git/config', 'x');
    resolves(library, '.git/config', 'file=.git/config is inside .git, which the build never reads.');
    resolves(library, 'sub/.git/config', 'file=sub/.git/config is inside .git, which the build never reads.');
    // A case-insensitive file system resolves these to the same folder; the check holds on any system.
    resolves(library, '.GIT/config', 'file=.GIT/config is inside .git, which the build never reads.');
    resolves(library, '.Git/x.txt', 'file=.Git/x.txt is inside .git, which the build never reads.');
  });

  // Windows also names the .git folder through its directory stream, which the real path gives as .git.
  it('refuses a file inside .git through its NTFS directory stream', { skip: process.platform !== 'win32' }, () => {
    const library = libraryNamed('inside git stream');
    if (!existsSync(join(library.root, '.git', 'config'))) put(library, '.git/config', 'x');
    resolves(
      library,
      '.git::$INDEX_ALLOCATION/config',
      'file=.git::$INDEX_ALLOCATION/config is inside .git, which the build never reads.',
    );
  });

  it('refuses a file that is missing', () => {
    const library = libraryNamed('missing');
    put(library, 'a.txt', 'x');
    resolves(library, 'nope.txt', 'file=nope.txt names no file in the library.');
    resolves(library, 'no/such/dir.txt', 'file=no/such/dir.txt names no file in the library.');
    resolves(library, 'a.txt/b.txt', 'file=a.txt/b.txt names no file in the library.');
  });

  it('refuses a folder', () => {
    const library = libraryNamed('folder');
    mkdirSync(join(library.root, 'sub'));
    resolves(library, 'sub', 'file=sub is a folder; name a file.');
  });

  it('allows a file in bin', () => {
    const library = libraryNamed('bin');
    const file = put(library, 'bin/x.txt', 'x');
    assert.deepEqual(resolveIncludedFile(library, 'bin/x.txt', page), { path: 'bin/x.txt', absolute: file });
  });

  it('refuses a file of more than 1 MiB and takes one of exactly 1 MiB', () => {
    const library = libraryNamed('size');
    put(library, 'big.txt', Buffer.alloc(1_048_577, 0x61));
    put(library, 'edge.txt', Buffer.alloc(1_048_576, 0x61));
    resolves(library, 'big.txt', 'file=big.txt is 1048577 bytes; a page includes a file of at most 1 MiB.');
    assert.equal(readIncludedFile(library, 'edge.txt', page).text.length, 1_048_576);
  });

  it('refuses a file that is not UTF-8 text', () => {
    const library = libraryNamed('not utf-8');
    put(library, 'nul.bin', Buffer.from([0x50, 0, 0x4b]));
    put(library, 'bad.bin', Buffer.from([0xff]));
    reads(library, 'nul.bin', 'file=nul.bin is not UTF-8 text.');
    reads(library, 'bad.bin', 'file=bad.bin is not UTF-8 text.');
  });

  it('refuses an empty file', () => {
    const library = libraryNamed('empty');
    put(library, 'a.txt', '');
    reads(library, 'a.txt', 'file=a.txt is empty.');
  });

  it('reads a file as written', () => {
    const library = libraryNamed('read');
    const file = put(library, 'src/a.txt', 'héllo\n');
    assert.deepEqual(readIncludedFile(library, 'src/a.txt', page), {
      path: 'src/a.txt',
      absolute: file,
      text: 'héllo\n',
    });
  });

  it('refuses a link that leads out of the library', withLinks, () => {
    const library = libraryNamed('link out');
    const outside = put({ root: join(library.root, '..', 'link out outside') }, 'secret.txt', 'x');
    symlinkSync(outside, join(library.root, 'link.txt'));
    symlinkSync(join(outside, '..'), join(library.root, 'dir'), 'dir');
    const real = realpathSync(outside);
    resolves(
      library,
      'link.txt',
      `file=link.txt is outside the library through a symbolic link: its real path is ${real}.`,
    );
    resolves(
      library,
      'dir/secret.txt',
      `file=dir/secret.txt is outside the library through a symbolic link: its real path is ${real}.`,
    );
  });

  it('refuses a link that leads nowhere or around in a loop', withLinks, () => {
    const library = libraryNamed('link broken');
    symlinkSync(resolve(library.root, 'gone.txt'), join(library.root, 'dangling.txt'));
    symlinkSync(join(library.root, 'b.txt'), join(library.root, 'a.txt'));
    symlinkSync(join(library.root, 'a.txt'), join(library.root, 'b.txt'));
    for (const path of ['dangling.txt', 'a.txt']) {
      assert.throws(
        () => resolveIncludedFile(library, path, page),
        (error) => {
          assert.ok(error.message.startsWith(`${page}: file=${path} could not be read: `), error.message);
          return true;
        },
      );
    }
  });

  it('reads a link that stays inside the library', withLinks, () => {
    const library = libraryNamed('link in');
    const target = put(library, 'real/a.txt', 'x\n');
    symlinkSync(target, join(library.root, 'link.txt'));
    assert.equal(readIncludedFile(library, 'link.txt', page).text, 'x\n');
  });

  it('refuses a link into .git', withLinks, () => {
    const library = libraryNamed('link git');
    const target = put(library, '.git/config', 'x');
    symlinkSync(target, join(library.root, 'config.txt'));
    resolves(library, 'config.txt', 'file=config.txt is inside .git, which the build never reads.');
  });

  it('finds the files a page includes and skips those it cannot place', () => {
    const library = libraryNamed('find');
    const present = put(library, 'a.txt', 'x');
    put(library, '.git/config', 'x');
    const pageFile = put(
      library,
      'docs/site/x.mdx',
      [
        '```txt file=a.txt',
        '```',
        '',
        '> ```txt file="missing.txt"',
        '> ```',
        '',
        '~~~txt file=.git/config',
        '~~~',
        '',
        '```txt file=a.txt',
        '```',
        '',
      ].join('\n'),
    );
    assert.deepEqual(findIncludedFiles(library, [{ file: pageFile }]), [present]);
  });

  it('changes its digest when an included file changes', () => {
    const library = libraryNamed('digest');
    const file = put(library, 'a.txt', 'one');
    const before = includesDigest([file]);
    assert.match(before, /^[0-9a-f]{16}$/);
    assert.equal(includesDigest([file]), before);
    put(library, 'a.txt', 'two');
    assert.notEqual(includesDigest([file]), before);
  });
});

const COMMIT = '589501c0123456789abcdef0123456789abcdef0';
const REPOSITORY = { url: 'https://github.com/NCodeGroup/Example', branch: 'main' };
// A third argument, even `undefined`, replaces the commit.
const filled = (library, node, ...commit) =>
  fillFileBlock({ value: '', ...node }, page, {
    library,
    repository: REPOSITORY,
    commit: commit.length > 0 ? commit[0] : COMMIT,
  });
const fills = (library, node, message) =>
  assert.throws(() => filled(library, node), { message: `${page}: ${message}` });
const captionOf = (result) => result.caption.children[0];

describe('the file include, filled', () => {
  it('captions a whole file with its path and the commit', () => {
    const library = libraryNamed('whole file');
    put(library, 'BannedSymbols.txt', 'one\ntwo\n');
    const result = filled(library, { lang: 'txt', meta: 'file=BannedSymbols.txt' });
    assert.equal(result.value, 'one\ntwo');
    assert.equal(result.meta, 'title="BannedSymbols.txt"');
    assert.deepEqual(result.caption, {
      type: 'paragraph',
      data: { hName: 'p', hProperties: { className: ['ncode-source'] } },
      children: [
        {
          type: 'link',
          url: 'https://github.com/NCodeGroup/Example/blob/589501c0123456789abcdef0123456789abcdef0/BannedSymbols.txt',
          children: [{ type: 'text', value: 'BannedSymbols.txt at 589501c' }],
        },
      ],
    });
  });

  it('links one line and a range of lines', () => {
    const library = libraryNamed('lines');
    put(library, 'src/X.cs', 'a\nb\nc\nd\ne\n');
    const one = captionOf(filled(library, { lang: 'cs', meta: 'file=src/X.cs from="d" to="d"' }));
    assert.equal(one.url, `${REPOSITORY.url}/blob/${COMMIT}/src/X.cs#L4`);
    assert.equal(one.children[0].value, 'src/X.cs, line 4 at 589501c');
    const range = captionOf(filled(library, { lang: 'cs', meta: 'file=src/X.cs from="b" to="d"' }));
    assert.equal(range.url, `${REPOSITORY.url}/blob/${COMMIT}/src/X.cs#L2-L4`);
    assert.equal(range.children[0].value, 'src/X.cs, lines 2–4 at 589501c');
  });

  it('names the branch when the commit is unknown', () => {
    const library = libraryNamed('no commit');
    put(library, 'src/X.cs', 'a\nb\nc\n');
    const whole = filled(library, { lang: 'cs', meta: 'file=src/X.cs' }, undefined);
    assert.equal(captionOf(whole).url, `${REPOSITORY.url}/blob/main/src/X.cs`);
    assert.equal(captionOf(whole).children[0].value, 'src/X.cs on main');
    const range = filled(library, { lang: 'cs', meta: 'file=src/X.cs from="b"' }, undefined);
    assert.equal(captionOf(range).url, `${REPOSITORY.url}/blob/main/src/X.cs#L2-L3`);
    assert.equal(captionOf(range).children[0].value, 'src/X.cs, lines 2–3 on main');
  });

  it('encodes a path in the link and shows it as written in the label and the title', () => {
    const library = libraryNamed('encoded');
    put(library, 'my docs/a b.txt', 'x');
    const quoted = filled(library, { lang: 'txt', meta: 'file="my docs/a b.txt"' });
    assert.equal(captionOf(quoted).url, `${REPOSITORY.url}/blob/${COMMIT}/my%20docs/a%20b.txt`);
    assert.equal(captionOf(quoted).children[0].value, 'my docs/a b.txt at 589501c');
    assert.equal(quoted.meta, 'title="my docs/a b.txt"');
  });

  it('titles the block with the path unless the author gives a title', () => {
    const library = libraryNamed('titles');
    put(library, 'a.txt', 'x');
    assert.equal(filled(library, { lang: 'txt', meta: 'file=a.txt' }).meta, 'title="a.txt"');
    assert.equal(filled(library, { lang: 'txt', meta: 'file=a.txt title="Mine"' }).meta, 'title="Mine"');
  });

  it('passes the other attributes on to Expressive Code', () => {
    const library = libraryNamed('passed on');
    put(library, 'a.txt', 'x');
    assert.equal(filled(library, { lang: 'txt', meta: 'file=a.txt wrap {2}' }).meta, 'title="a.txt" wrap {2}');
  });

  it('leaves a block without a file reference alone', () => {
    const library = libraryNamed('no reference');
    assert.equal(filled(library, { lang: 'cs', meta: 'title="x.cs" {2}', value: 'code' }), undefined);
    assert.equal(filled(library, { lang: null, meta: null, value: 'code' }), undefined);
  });

  it('asks for the language first', () => {
    const library = libraryNamed('no language');
    fills(
      library,
      { lang: 'file=a.txt', meta: null },
      'a code block with file=a.txt needs its language first, as in ```txt file=a.txt',
    );
    fills(
      library,
      { lang: 'file=a.txt', meta: 'from="x"' },
      'a code block with file=a.txt needs its language first, as in ```txt file=a.txt',
    );
    fills(
      library,
      { lang: 'from=x', meta: null },
      'from= and to= select lines of the file that file= names; this code block has no file=.',
    );
  });

  it('refuses a language the code blocks do not highlight', () => {
    const library = libraryNamed('unknown language');
    put(library, 'a.txt', 'x');
    fills(
      library,
      { lang: 'nosuchlang', meta: 'file=a.txt' },
      'file=a.txt says nosuchlang, which is not a language the code blocks highlight; use txt for plain text.',
    );
    for (const lang of ['txt', 'text', 'plaintext', 'plain', 'csharp', 'cs', 'yml']) {
      assert.equal(filled(library, { lang, meta: 'file=a.txt' }).value, 'x');
    }
  });

  it('refuses a block that has code of its own', () => {
    const library = libraryNamed('code of its own');
    put(library, 'a.txt', 'x');
    fills(
      library,
      { lang: 'txt', meta: 'file=a.txt', value: 'mine' },
      'a code block with file=a.txt must be empty; its text comes from the file.',
    );
  });

  it('names the page when the language is file= with no path', () => {
    const library = libraryNamed('language is file=');
    assert.throws(
      () => filled(library, { lang: 'file=', meta: '', value: '' }),
      (error) => error instanceof Error && !(error instanceof TypeError) && error.message.startsWith(`${page}: `),
    );
  });

  it('refuses a block that takes a sample and a file', () => {
    const library = libraryNamed('snippet and file');
    put(library, 'a.txt', 'x');
    fills(library, { lang: 'txt', meta: 'file=a.txt snippet=Key' }, 'a code block takes snippet= or file=, not both.');
  });
});

const BROKEN = 'docs/site/guides/broken.mdx';

/** Builds a copy of the fixture whose broken page holds `block`, and expects the build to name `message`. */
function failsWith(name, block, message, prepare = () => {}) {
  const output = failingBuild(name, (library) => {
    prepare(library);
    writeFileSync(join(library, BROKEN), pageBody(block));
  });
  assert.ok(output.includes(`${BROKEN}: ${message}`), output);
}

describe('a wrong file include fails the build', () => {
  it('a file the library does not have', () => {
    failsWith(
      'include-missing',
      '```txt file=NoSuchFile.txt\n```',
      'file=NoSuchFile.txt names no file in the library.',
    );
  });

  it('a path that leaves the library', () => {
    failsWith('include-parent', '```txt file=../outside.txt\n```', BAD_PATH('../outside.txt'));
  });

  it('an absolute path', () => {
    failsWith('include-absolute', '```txt file=/etc/hosts\n```', BAD_PATH('/etc/hosts'));
  });

  it('a file inside .git', () => {
    failsWith(
      'include-git',
      '```txt file=.git/config\n```',
      'file=.git/config is inside .git, which the build never reads.',
    );
  });

  it('a file= with no path', () => {
    failsWith('include-empty-path', '```txt file=\n```', BAD_PATH(''));
  });

  it('a folder', () => {
    failsWith('include-folder', '```txt file=docs\n```', 'file=docs is a folder; name a file.');
  });

  it('a symbolic link to a file outside the library', withLinks, () => {
    const target = join(work, 'libraries', 'include-link-target.txt');
    // The expected message holds the target's real path, so the target exists before `failsWith` is called.
    mkdirSync(join(work, 'libraries'), { recursive: true });
    writeFileSync(target, 'outside\n');
    failsWith(
      'include-link',
      '```txt file=linked.txt\n```',
      `file=linked.txt is outside the library through a symbolic link: its real path is ${realpathSync(target)}.`,
      (library) => symlinkSync(target, join(library, 'linked.txt')),
    );
  });

  it('a file that is not text', () => {
    failsWith('include-binary', '```txt file=binary.dat\n```', 'file=binary.dat is not UTF-8 text.', (library) =>
      writeFileSync(join(library, 'binary.dat'), Buffer.from([0x50, 0, 0x4b])),
    );
  });

  it('a from text that is on no line', () => {
    failsWith(
      'include-from-nowhere',
      '```txt file=BannedSymbols.txt from="no such text"\n```',
      'file=BannedSymbols.txt from="no such text" is on no line of the file.',
    );
  });

  it('a from text that is on two lines', () => {
    failsWith(
      'include-from-twice',
      '```txt file=BannedSymbols.txt from="Shared;Rent"\n```',
      'file=BannedSymbols.txt from="Shared;Rent" is on lines 2 and 3; give text that is on one line only.',
    );
  });

  it('a to text that is on no line after from', () => {
    failsWith(
      'include-to-nowhere',
      '```txt file=BannedSymbols.txt from="ArrayPool" to="no such text"\n```',
      'file=BannedSymbols.txt to="no such text" is on no line from line 2 on.',
    );
  });

  it('a line range', () => {
    failsWith(
      'include-lines',
      '```txt file=BannedSymbols.txt lines=2-3\n```',
      'lines=2-3 is not supported: a line range shows other lines once the file changes. Name the first and last lines by their text, with from="…" and to="…".',
    );
  });

  it('a block without its language', () => {
    failsWith(
      'include-no-language',
      '``` file=BannedSymbols.txt\n```',
      'a code block with file=BannedSymbols.txt needs its language first, as in ```txt file=BannedSymbols.txt',
    );
  });

  it('a language the code blocks do not highlight', () => {
    failsWith(
      'include-unknown-language',
      '```nosuchlang file=BannedSymbols.txt\n```',
      'file=BannedSymbols.txt says nosuchlang, which is not a language the code blocks highlight; use txt for plain text.',
    );
  });

  it('a block that holds code of its own', () => {
    failsWith(
      'include-not-empty',
      '```txt file=BannedSymbols.txt\nmine\n```',
      'a code block with file=BannedSymbols.txt must be empty; its text comes from the file.',
    );
  });

  it('a block that takes a sample and a file', () => {
    failsWith(
      'include-snippet-and-file',
      '```cs snippet=QuickStart file=BannedSymbols.txt\n```',
      'a code block takes snippet= or file=, not both.',
    );
  });
});

describe('a library outside any repository', () => {
  it('links the branch, and does not warn', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ncode-docs-'));
    try {
      cpSync(fixture, dir, { recursive: true });
      const result = build('includes-no-repository', { library: dir });
      assert.equal(result.code, 0, result.output);
      const html = readFileSync(join(result.out, 'guides/ban-apis/index.html'), 'utf8');
      const captions = [...html.matchAll(/<p class="ncode-source">.*?<\/p>/gs)].map(([paragraph]) => paragraph);
      assert.equal(captions.length, 3, 'each file block has a caption');
      for (const caption of captions) {
        assert.ok(caption.includes('/blob/main/'), caption);
        assert.match(caption, /on main/);
      }
      for (const line of result.output.split(/\r\n|\r|\n/)) {
        assert.ok(!line.startsWith('Source links name the branch'), line);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
