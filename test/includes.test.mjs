// Copyright © NCode Group
// SPDX-License-Identifier: Apache-2.0

// The file include: reading a code block's file reference and selecting the lines it shows.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseFileReference, selectLines } from '../src/includes/files.mjs';

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
