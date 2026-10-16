---
name: Next.js preview CSS bundling
description: Replit preview's Next.js Turbopack dev server can fail while loading Tailwind PostCSS.
---

For this workspace, Next.js Turbopack dev failed to resolve `@vercel/turbopack/postcss` while compiling Tailwind CSS, even though the normal PostCSS configuration and package were present. Running Next dev with Webpack successfully rendered the storefront; the production `next build` command remains unchanged.

**Why:** A blank preview was caused by a dev-bundler module-resolution failure rather than an app route, API, or port problem.

**How to apply:** Keep the storefront preview on Next Webpack unless a validated Turbopack update/configuration removes this failure. After changing dev bundling, restart the storefront workflow and verify routes plus browser logs.
