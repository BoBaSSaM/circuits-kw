---
name: Next.js Replit preview checks
description: Local-port screenshots can pass while the proxied Replit preview still fails to hydrate.
---

For this workspace, Next.js Turbopack dev failed to resolve `@vercel/turbopack/postcss` while compiling Tailwind CSS, so Webpack is the tested dev workaround. Separately, the Replit preview host must be included in Next.js `allowedDevOrigins`; otherwise the HMR WebSocket can return 502 through the proxy while direct localhost checks still pass. Since the storefront route is client-rendered, that can leave the preview blank.

**Why:** A screenshot against localhost bypasses Replit's preview proxy and can falsely suggest the user-facing preview works.

**How to apply:** Keep the storefront preview on Next Webpack unless a validated Turbopack update/configuration removes the CSS failure. Allow the exact `REPLIT_DEV_DOMAIN` in `allowedDevOrigins`, then verify the actual proxied domain, HMR WebSocket, route content, and browser errors—not just the local port.
