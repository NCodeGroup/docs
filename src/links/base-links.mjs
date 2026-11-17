// Starlight adds the site's base path to its own links (the sidebar, the site title, assets) and to
// nothing an author writes. This Sätteri hast plugin adds it to site-absolute `href` and `src`
// values in a page, so an author writes `/guides/derive-a-key/` and the link works under
// `/Buffers/` and at the root of a custom domain alike:
//
//   - Markdown links and images;
//   - in an `.mdx` page, the same attributes written as plain strings on `<a>`, `<img>`,
//     `<LinkCard>` and `<LinkButton>` (an attribute written as an expression, `href={...}`, is the
//     author's own);
//   - in a `.md` page, the same attributes of `<a>` and `<img>` written as HTML. There the HTML is
//     text the processor passes through unparsed, so the opening tags are found in that text.
//
// Hero actions and `prev`/`next` in frontmatter are data, not markup: src/route-data.ts handles
// them. What neither reaches, starlight-links-validator reports, and the build fails.
//
// A link an author wrote with the base path already on it (`/Buffers/guides/x/`) stops the build
// here, by page and link. Left alone it would work under that base and break on the day the site
// moves to another one, such as a custom domain, where only the deploying build would notice.
import { fileURLToPath } from 'node:url';

const prefixOf = (base) => `/${base.replace(/^\/|\/$/g, '')}`;
const siteAbsolute = (link) => typeof link === 'string' && link.startsWith('/') && !link.startsWith('//');

/**
 * `/x/` with the base in front; anything that is not site-absolute, or already has it, unchanged.
 * For links Starlight may already have put the base on (`prev` and `next`).
 */
export function withBase(base, link) {
  const prefix = prefixOf(base);
  if (prefix === '/' || !siteAbsolute(link)) return link;
  if (link === prefix || link.startsWith(`${prefix}/`)) return link;
  return prefix + link;
}

/**
 * `/x/` with the base in front, for a link exactly as its author wrote it: one that already
 * starts with the base path is an error, which names `where` it was written.
 */
export function addBase(base, link, where) {
  const prefix = prefixOf(base);
  if (prefix === '/' || !siteAbsolute(link)) return link;
  if (link === prefix || link.startsWith(`${prefix}/`)) {
    throw new Error(
      `${where}: the link ${link} starts with the site's base path ${prefix}. Write it from the site's root, as ${link.slice(prefix.length) || '/'}: ` +
        'the build adds the base path, and the same page must work where the site is served under another.',
    );
  }
  return prefix + link;
}

/** An opening `<a>` or `<img>` tag in HTML that a Markdown page passes through as text. */
const HTML_TAG = /<(a|img)\b[^>]*>/gi;
/** The link attribute of each, with its value in double quotes, in single quotes or bare. */
const HTML_LINKS = {
  a: /(\shref\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i,
  img: /(\ssrc\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i,
};

/**
 * HTML as an author wrote it in a `.md` page, with the base in front of each site-absolute `href`
 * of an `<a>` and `src` of an `<img>`. Everything else is returned as it was written.
 */
export function addBaseToHtml(base, html, where) {
  return html.replace(HTML_TAG, (tag, name) =>
    tag.replace(HTML_LINKS[name.toLowerCase()], (attribute, start, double, single, bare) => {
      const link = double ?? single ?? bare;
      const fixed = addBase(base, link, where);
      if (fixed === link) return attribute;
      const quote = double !== undefined ? '"' : single !== undefined ? "'" : '';
      return `${start}${quote}${fixed}${quote}`;
    }),
  );
}

/** The attribute of each MDX component that holds a link. */
const MDX_LINKS = { a: 'href', img: 'src', LinkCard: 'href', LinkButton: 'href' };

/**
 * For `satteri({ hastPlugins: [baseLinks(base)] })`.
 * @param {string} base The base path, such as /Buffers or /.
 * @param {{ describePage?: (file: string) => string }} [options] Names a page file in an error message.
 */
export function baseLinks(base, { describePage = (file) => file } = {}) {
  return ({ fileURL }) => visitors(base, fileURL ? describePage(fileURLToPath(fileURL)) : 'A page');
}

function visitors(base, page) {
  const visitMdx = {
    filter: Object.keys(MDX_LINKS),
    visit(node, ctx) {
      const name = MDX_LINKS[node.name];
      const attribute = node.attributes.find(
        (candidate) => candidate.type === 'mdxJsxAttribute' && candidate.name === name,
      );
      if (!attribute || typeof attribute.value !== 'string') return;
      const fixed = addBase(base, attribute.value, page);
      if (fixed !== attribute.value) ctx.setAttribute(node, name, fixed);
    },
  };
  return {
    name: 'ncode-base-links',
    element: {
      filter: ['a', 'img'],
      visit(node, ctx) {
        const key = node.tagName === 'a' ? 'href' : 'src';
        const value = node.properties?.[key];
        const fixed = addBase(base, value, page);
        if (fixed !== value) ctx.setProperty(node, key, fixed);
      },
    },
    raw(node, ctx) {
      const fixed = addBaseToHtml(base, node.value, page);
      if (fixed !== node.value) ctx.setField(node, 'value', fixed);
    },
    mdxJsxFlowElement: visitMdx,
    mdxJsxTextElement: visitMdx,
  };
}
