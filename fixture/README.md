# NCode.Fixture

A stand-in for a library repository, for the documentation toolchain's own build and tests. It has what a library
keeps: pages and a site configuration in `docs/site/`, a component and images of its own beside them, sample regions
in `tests/`, and the workflow that calls the toolchain. It has no `package.json` and no lockfile, as no library does.

The fixture also has build files at its root, `Directory.Build.props` and `BannedSymbols.txt`, that
`guides/ban-apis.mdx` includes, and its configuration requires a Checklist section on its guides `derive-a-key` and
`ban-apis`.
