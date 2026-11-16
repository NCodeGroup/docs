# NCode.Fixture

A stand-in for a library repository, for the documentation toolchain's own build and tests. It has what a library
keeps: pages and a site configuration in `docs/site/`, a component and images of its own beside them, sample regions
in `tests/`, and the workflow that calls the toolchain. It has no `package.json` and no lockfile, as no library does.
