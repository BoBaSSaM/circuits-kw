---
name: npm lockfile registry portability
description: Make npm lockfiles created through Replit's package firewall installable on external build hosts.
---

When a lockfile records absolute URLs from Replit's internal package registry, changing the registry alone does not redirect those downloads. Configure npm to replace the exact internal registry prefix with whichever registry the environment has configured, rather than hardcoding a public registry for every environment.

**Why:** npm preserves custom resolved URLs in lockfiles; external builders such as Vercel cannot reach Replit's internal package host.

**How to apply:** Inspect lockfile `resolved` URLs and the project npm configuration. Map the old host and path to npm's active registry, then verify dependency installation and the production build on the external host.
