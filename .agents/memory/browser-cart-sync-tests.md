---
name: Cart sync browser tests
description: Avoid cart storage being reset while testing multi-tab synchronization.
---

Playwright `context.addInitScript` runs on every page load, so cart seeding inside it overwrites storage again on navigation. Use client-side navigation after exercising synchronization, or guard the seed so it only runs once.

**Why:** A full-page route change can silently replace the cart state and make a successful multi-tab merge look like data loss.

**How to apply:** When browser tests install storage-event interception with an init script, navigate through app links for post-sync assertions, or explicitly make the seed one-shot.
