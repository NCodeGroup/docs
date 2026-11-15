// Starlight route middleware: runs once for every page, before it renders.
//
//   1. Adds the base path to the site-absolute links Starlight renders exactly as written from
//      frontmatter: hero actions, and `prev` and `next`. (Links in a page's body are
//      src/links/base-links.mjs's.)
//   2. Sets the edit link and the "last updated" date from the library's repository. Starlight
//      would work both out from the file it read, which is a copy inside this toolchain.
//   3. Gives the home page the site's name as its browser title, not "Name | Name".
import { defineRouteMiddleware } from '@astrojs/starlight/route-data';
import { site } from 'virtual:ncode-docs/site';
import { addBase, withBase } from './links/base-links.mjs';

const base = import.meta.env.BASE_URL;
const MOUNT = 'src/content/docs/';
/** Frontmatter links that already have the base: the dev server renders a page, and so runs this, more than once. */
const fixedLinks = new WeakSet<object>();

export const onRequest = defineRouteMiddleware((context) => {
  const route = context.locals.starlightRoute;
  const { entry, pagination, head } = route;

  // The page's file under the content folder, such as guides/derive-a-key.mdx.
  const file = entry.filePath?.replaceAll('\\', '/').split(MOUNT)[1];

  // A hero action, and a `prev` or `next` the frontmatter gives a link, is exactly what its author
  // wrote, so one with the base path already on it is an error, as it is in a page's body. The base
  // goes onto the frontmatter itself: that is where the link validator reads these links, and it
  // follows a change made here. The `prev` and `next` Starlight works out from the navigation
  // already have the base.
  const page = `${site.contentPath}/${file ?? entry.id}`;
  for (const action of entry.data.hero?.actions ?? []) {
    if (fixedLinks.has(action)) continue;
    action.link = addBase(base, action.link, `${page} (hero action "${action.text}")`);
    fixedLinks.add(action);
  }
  for (const side of ['prev', 'next'] as const) {
    const own = entry.data[side];
    if (typeof own === 'object' && own.link !== undefined && !fixedLinks.has(own)) {
      own.link = addBase(base, own.link, `${page} (${side})`);
      fixedLinks.add(own);
    }
    const link = pagination[side];
    if (link) link.href = withBase(base, link.href);
  }
  route.editUrl = undefined;
  route.lastUpdated = undefined;
  if (file && entry.id !== '404') {
    if (site.editLinks && entry.data.editUrl !== false) {
      route.editUrl =
        typeof entry.data.editUrl === 'string'
          ? new URL(entry.data.editUrl)
          : new URL(`${site.repository.url}/edit/${site.repository.branch}/${site.contentPath}/${file}`);
    }
    if (entry.data.lastUpdated instanceof Date) route.lastUpdated = entry.data.lastUpdated;
    else if (site.lastUpdated && entry.data.lastUpdated !== false && site.lastUpdatedByFile[file]) {
      route.lastUpdated = new Date(site.lastUpdatedByFile[file]);
    }
  }

  if (entry.data.title === site.title) {
    const title = head.find((tag) => tag.tag === 'title');
    if (title) title.content = site.title;
  }
});
