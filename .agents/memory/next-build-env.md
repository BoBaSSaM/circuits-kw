---
name: Next.js deployment build environment
description: Workspace production builds must not depend on preview-only PORT or BASE_PATH values.
---

Keep `PORT` and `BASE_PATH` optional during production builds. Root workspace builds should work when both are unset; preview workflows can provide them at runtime.

**Why:** A workspace deployment build previously failed when build configuration assumed a preview workflow had supplied `PORT`.

**How to apply:** When changing artifact build configuration or workspace commands, verify the root build with `PORT` and `BASE_PATH` unset. Keep listening ports and preview routing configuration in the runtime workflow.

Each Next.js workspace deployed independently should also declare `typescript` in its own `devDependencies`; do not rely on a root-only TypeScript dependency when Vercel builds from an app subdirectory.

**Why:** Vercel's storefront build could not find TypeScript when it was only declared at the monorepo root.

**How to apply:** Add TypeScript to the app workspace's manifest and keep the workspace lock entry in sync before deploying that app separately.

When a storefront build depends on TypeScript project-reference declarations, run code generation first and force-build the referenced libraries before `next build`. Ordinary incremental `tsc --build` may trust stale build-info files even when a referenced `dist` output has been removed.

**Why:** A clean deployment test reproduced TS6305 because cached `.tsbuildinfo` caused the library build to skip regenerating missing declarations.

**How to apply:** In clean deployment and CI builds, run the repository's generator, then `tsc --build --force` for the referenced projects before Next.js type-checks the app.

The storefront is deployed independently on Vercel; Replit secrets are not automatically available to that deployment.

**Why:** Local catalog requests can succeed with Replit's MongoDB secret while the Vercel deployment still fails if its own environment is missing or misconfigured.

**How to apply:** When diagnosing production auth, catalog, or checkout failures, verify the required environment variables in the matching Vercel Production or Preview environment rather than assuming Replit secrets carry over.
