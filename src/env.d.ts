// Copyright © NCode Group
// SPDX-License-Identifier: Apache-2.0

declare module 'virtual:ncode-docs/site' {
  /** The settings of the library the build is for: astro.config.mjs builds them, and src/integration.mjs adds the mount. */
  export const site: {
    title: string;
    product: string;
    mark: 'ncode' | 'ncode-identity';
    version?: string;
    repository: { url: string; branch: string };
    social: { label: string; href: string }[];
    contentPath: string;
    /** The library's own 404 page at the root of its content folder, 404.mdx or 404.md, when it has one (src/library.mjs). */
    notFoundPage?: string;
    /** The folder Starlight reads pages from, as a page's filePath starts: src/content/docs/ (src/library.mjs). */
    mount: string;
    editLinks: boolean;
    lastUpdated: boolean;
    lastUpdatedByFile: Record<string, number>;
  };
}
