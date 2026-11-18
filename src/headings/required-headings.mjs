// Copyright © NCode Group
// SPDX-License-Identifier: Apache-2.0

// The `requiredHeadings` rules of a library's site.config.json: which pages each rule covers, and
// the mdast plugin that checks a page has the headings its rules list, in the order listed. The
// caller says how to name a page and how to find its slug, because the page the build reads is a
// mounted copy.
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Matches the rules to the pages they cover and checks the rules themselves.
 * @param {{ pages: string[], headings: string[], except?: string[] }[] | undefined} rules
 *   `requiredHeadings` of the configuration.
 * @param {{ slug: string }[]} pages The pages of the library, from `listPages`.
 * @param {{ configName: string, contentPath: string }} library Names the configuration and the content folder in a message.
 * @returns {Map<string, { index: number, globs: string[], headings: string[] }[]>} The rules that
 *   cover each page, by the page's slug, in the order the rules are listed.
 */
export function resolveHeadingRules(rules, pages, { configName, contentPath }) {
  const bySlug = new Map();
  const problems = [];
  (rules ?? []).forEach((rule, index) => {
    const at = `requiredHeadings[${index}]`;
    const matches = (glob, slug) => posix.matchesGlob(slug, glob);
    for (const glob of rule.pages) {
      if (!pages.some((page) => matches(glob, page.slug)))
        problems.push(`${at}.pages "${glob}" matches no page in ${contentPath}.`);
    }
    const except = rule.except ?? [];
    for (const slug of except) {
      if (!rule.pages.some((glob) => matches(glob, slug)))
        problems.push(`${at}.except "${slug}" is not a page that ${at}.pages matches.`);
    }
    const seen = new Set();
    for (const heading of rule.headings) {
      if (seen.has(heading)) problems.push(`${at}.headings lists "${heading}" twice.`);
      seen.add(heading);
    }
    for (const { slug } of pages) {
      if (except.includes(slug) || !rule.pages.some((glob) => matches(glob, slug))) continue;
      const covering = bySlug.get(slug) ?? [];
      covering.push({ index, globs: rule.pages, headings: rule.headings });
      bySlug.set(slug, covering);
    }
  });
  if (problems.length === 1) throw new Error(`${configName}: ${problems[0]}`);
  if (problems.length > 1) throw new Error(`${configName} has wrong requiredHeadings:\n  ${problems.join('\n  ')}`);
  return bySlug;
}

/**
 * For `satteri({ mdastPlugins: [headingsPlugin(bySlug, { describePage, slugOf, configName })] })`.
 * @param {Map<string, { index: number, globs: string[], headings: string[] }[]>} bySlug From `resolveHeadingRules`.
 * @param {object} options
 * @param {(file: string) => string} options.describePage Names a page file in an error message.
 * @param {(file: string) => string} options.slugOf The slug of a page file.
 * @param {string} options.configName Names the configuration in an error message.
 */
export function headingsPlugin(bySlug, { describePage, slugOf, configName }) {
  return [
    // Astro caches each rendered Markdown page by the page's own content, and hashes its config to
    // decide when that cache is stale. The rules are part of that config, so a changed rule makes
    // a page that was valid render, and be checked, again.
    { name: 'ncode-required-headings-cache-key', rules: JSON.stringify([...bySlug]) },
    ({ fileURL }) => {
      const file = fileURL ? fileURLToPath(fileURL) : undefined;
      const slug = file === undefined ? undefined : slugOf(file);
      const rules = slug === undefined ? undefined : bySlug.get(slug);
      const found = [];
      return {
        name: 'ncode-required-headings',
        heading(node, context) {
          if (!rules) return;
          found.push(`${'#'.repeat(node.depth)} ${context.textContent(node).trim()}`);
        },
        after() {
          if (!rules) return;
          const page = describePage(file);
          for (const { index, globs, headings } of rules) {
            const missing = headings.find((heading) => !found.includes(heading));
            if (missing !== undefined)
              throw new Error(
                `${page} has no "${missing}" heading, which requiredHeadings[${index}] in ${configName} requires on every page its globs match (${globs.join(', ')}). Add the heading, or add "${slug}" to that rule's "except".`,
              );
            for (let i = 1; i < headings.length; i++) {
              if (found.indexOf(headings[i]) < found.indexOf(headings[i - 1]))
                throw new Error(
                  `${page} has "${headings[i - 1]}" after "${headings[i]}", and requiredHeadings[${index}] in ${configName} lists them in this order: ${headings.map((heading) => `"${heading}"`).join(', ')}.`,
                );
            }
          }
        },
      };
    },
  ];
}
