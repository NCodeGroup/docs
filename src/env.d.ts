declare module 'virtual:ncode-docs/site' {
  /** The settings of the library the build is for; astro.config.mjs builds it. */
  export const site: {
    title: string;
    product: string;
    mark: 'ncode' | 'ncode-identity';
    version?: string;
    repository: { url: string; branch: string };
    social: { label: string; href: string }[];
    contentPath: string;
    editLinks: boolean;
    lastUpdated: boolean;
    lastUpdatedByFile: Record<string, number>;
  };
}
