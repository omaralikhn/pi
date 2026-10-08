---
title: Local global Pi installation
tags:
  - pi
  - install
  - global
  - npm
  - local
  - release
  - tarball
  - workspace
  - dependencies
---

A locally built Pi checkout installs globally through release tarballs rather than an npm link or a single coding-agent tarball.

## Why

Pi's coding-agent package depends on unpublished workspace packages such as `@earendil-works/chord`, so a standalone global install of only the coding-agent tarball fails dependency resolution. A global link runs source-checkout files and does not verify the packaged artifact.

## Process

1. **Build** the coding-agent package from the checkout.

   ```bash
   cd /Users/omaralikhn/pi
   npm --prefix packages/coding-agent run build
   ```

2. **Pack** every public workspace package into a temporary directory.

   ```bash
   cd /Users/omaralikhn/pi
   node /var/folders/.../pack-pi-release.mjs
   ```

   Use a temporary script that imports `packReleasePackages` from `scripts/coding-agent-consumer.mjs` and `getPublicWorkspacePackages` from `scripts/release-packages.mjs`, then writes the resulting tarball paths to `tarballs.json`.

3. **Install** all generated tarballs in one global npm command.

   ```bash
   npm install -g --ignore-scripts <every-public-workspace-tarball>
   ```

4. **Verify** the installed executable and package location.

   ```bash
   pi --version
   npm ls -g --depth=0 @earendil-works/pi-coding-agent
   readlink /opt/homebrew/bin/pi
   ```

## Invariants

* **All workspace tarballs** must be supplied to npm so internal `^2.0.0` dependencies resolve locally rather than from the public registry.
* **Ignore scripts** during package installation unless an explicit review authorizes lifecycle scripts.
* **Temporary artifacts** belong under `$TMPDIR` and should be removed after a successful installation.
* **Installed binary** should resolve under the global npm root, not `/Users/omaralikhn/pi/packages/coding-agent`.

## Failure mode

* A single **coding-agent tarball** install can fail with `ETARGET` for `@earendil-works/chord@^2.0.0` because that package version is not available from the registry.

## Modules

| Concern | Source |
| --- | --- |
| Public workspace inventory | `scripts/release-packages.mjs` |
| Release tarball packaging | `scripts/coding-agent-consumer.mjs` |
| Isolated consumer installation | `scripts/coding-agent-consumer.mjs` |
| Local release orchestration | `scripts/local-release.mjs` |

## Limits

* The repository has no checked-in command that performs this global installation directly.
* The full `npm run release:local` workflow performs broader release validation and produces local release artifacts, but it is not required when installing an already built checkout.
