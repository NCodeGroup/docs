// The two functions the link checks rest on, without a build: the base path goes onto the HTML an
// author writes in a plain Markdown page, and a built page's URLs are read from its tags alone.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { addBaseToHtml } from '../src/links/base-links.mjs';
import { siteAbsoluteUrls } from '../src/links/built-links.mjs';

describe('the base path on HTML written in a Markdown page', () => {
  const add = (html) => addBaseToHtml('/Fixture', html, 'guides/x.md');

  it('goes onto the href of an <a> and the src of an <img>, however the value is quoted', () => {
    assert.equal(add('<a href="/x/">'), '<a href="/Fixture/x/">');
    assert.equal(add("<a class='k' href='/x/#y'>"), "<a class='k' href='/Fixture/x/#y'>");
    assert.equal(add('<a href=/x/>'), '<a href=/Fixture/x/>');
    assert.equal(add('<div>\n  <IMG alt="x" SRC="/x.png">\n</div>'), '<div>\n  <IMG alt="x" SRC="/Fixture/x.png">\n</div>');
  });

  it('leaves every other link as it was written', () => {
    for (const html of ['<a href="https://example.test/x/">', '<a href="//example.test/x/">', '<a href="#y">', '<a href="../x/">', '<a name="/x/">', '<video poster="/x.png">', '</a>']) {
      assert.equal(add(html), html);
    }
  });

  it('adds nothing at the root of a domain', () => {
    assert.equal(addBaseToHtml('/', '<a href="/x/">', 'guides/x.md'), '<a href="/x/">');
  });

  it('refuses a link written with the base path, and names the page', () => {
    assert.throws(() => add('<a href="/Fixture/x/">'), /guides\/x\.md: the link \/Fixture\/x\/ starts with the site's base path \/Fixture\. Write it from the site's root, as \/x\//);
  });
});

describe('the site-absolute URLs of a built page', () => {
  it('are the href, src, action, poster and srcset of its tags, however the value is quoted', () => {
    const html = `<a href="/a/">a</a> <a href='/b/'>b</a> <a href=/c/>c</a> <img src="/d.png" srcset="/e.png 1x, /f.png 2x">
      <form action="/g/"></form> <video poster="/h.png"></video> <A HREF="/i/">i</A> <a title="1 > 0" href="/j/">j</a>`;
    assert.deepEqual(siteAbsoluteUrls(html), ['/a/', '/b/', '/c/', '/d.png', '/e.png', '/f.png', '/g/', '/h.png', '/i/', '/j/']);
  });

  it('leave out every other URL', () => {
    assert.deepEqual(siteAbsoluteUrls('<a href="https://example.test/">x</a> <a href="//example.test/">y</a> <a href="#z">z</a> <a href="../x/">w</a>'), []);
  });

  it('leave out HTML that the page shows as text, and what a comment, a script or a style holds', () => {
    const html = `<code>&lt;a href="/shown/"&gt;</code> <p>Write href="/prose/" there.</p> <!-- <a href="/comment/"> -->
      <script>const link = '<a href="/script/">';</script> <style>a[href="/style/"] { color: red }</style> <a href="/real/">real</a>`;
    assert.deepEqual(siteAbsoluteUrls(html), ['/real/']);
  });
});
