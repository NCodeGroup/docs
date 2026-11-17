# Security Policy

## Report a Vulnerability

Report a vulnerability in NCode Docs privately. Never put it in a public issue, pull request or discussion: that tells attackers about it before a fix exists.

On the repository's **Security** tab, choose **Report a vulnerability**. The report reaches the maintainers only, and the fix is discussed in a private security advisory until it is released. If the tab has no such button, open an issue that asks for a private contact, and leave out every detail of the vulnerability.

Include:

- what is affected: the version or commit, and the file, endpoint or feature;
- how to reproduce it, as steps or a proof of concept;
- what it lets an attacker do;
- any fix or mitigation you know of, and how you'd like to be credited.

## What to Expect

- An acknowledgement of the report within 14 days, then whether it is confirmed.
- A fix developed in private and released as soon as it is ready, with an entry under `### Security` in the changelog.
- Disclosure coordinated with you: the security advisory is published once the fix is released. Keep the details private until then.
- Credit for the report in the advisory, unless you'd rather not be named.

## Supported Versions

Fixes go into the default branch and the next release. Only the latest release is supported: update to it to get a fix.

## Verify a Release

Releases are immutable: once one is published, its tag and files can't change, and GitHub signs an attestation of them. `gh release verify <tag> --repo NCodeGroup/docs` checks a release's attestation.

While the repository is public, the Tag and publish release workflow signs each release tag with [gitsign](https://github.com/sigstore/gitsign), through Sigstore's keyless signing, so no signing key exists to leak. With gitsign installed, check a tag in a clone of the repository:

```shell
gitsign verify-tag --certificate-identity https://github.com/NCodeGroup/docs/.github/workflows/tag-release.yml@refs/heads/main --certificate-oidc-issuer https://token.actions.githubusercontent.com <tag>
```

## Scope

In scope: the code, build and CI configuration in this repository, including a vulnerability that comes from how NCode Docs uses a dependency.

Out of scope: a vulnerability in a dependency itself. Report it to that project. Once it publishes a fix, an issue or pull request here that moves to the fixed version is welcome, though Dependabot usually proposes it first.
