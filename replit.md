# Circuits KW

A Kuwait-focused electronics storefront for components, project kits, and build guidance.

## Run & Operate

- `npm run dev --workspace=@workspace/voltiva-store` — run the storefront
- `npm run dev --workspace=@workspace/api-server` — run the API service
- `npm run dev --workspace=@workspace/mockup-sandbox` — run component previews
- `npm run typecheck` — typecheck libraries and workspaces
- `npm run build` — typecheck and build every Next.js app
- `npm run codegen --workspace=@workspace/api-spec` — regenerate API hooks and Zod schemas
- `npm run push --workspace=@workspace/db` — update the development Drizzle schema only
- Required secrets: `MONGODB_URI` and Clerk publishable/secret keys (`MONGODB_URL` remains supported as a legacy alias)

## Stack

- npm workspaces, Node.js 24, TypeScript 5.9
- Storefront, API, and component preview: Next.js 16
- API routes: Next.js route handlers wrapping the existing Express 5 router
- Product, order, and user data: MongoDB Atlas
- Stripe Checkout: Replit preview can use the connected Stripe integration; Vercel needs `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` configured in its project environment. Register `https://<production-domain>/api/stripe/webhook` as the Stripe webhook endpoint.
- Stripe Checkout amounts are resolved server-side from MongoDB catalog prices. Browser-only Build Assist supplier estimates are not eligible for paid checkout until those prices are stored and verified server-side.
- Authentication: Clerk
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)

## Where things live

- `artifacts/voltiva-store` — storefront, account flows, and dashboard
- `artifacts/api-server` — API routes, authentication, and MongoDB-backed services
- `artifacts/mockup-sandbox` — isolated component previews
- `lib/api-spec` — OpenAPI source and API code generation
- `lib/db` — Drizzle/Postgres scaffold; the commerce catalog and orders use MongoDB

## Architecture decisions

- Keep Clerk for sign-in and use MongoDB Atlas for application records.
- Storefront and API are deployed together through the storefront's Next.js route handler.
- Keep the API server artifact available for development and direct API testing.

## Product

Users can browse electronics parts, build kits and BOMs, save carts, and submit demo orders in KWD. Staff manage products, orders, and users through a role-protected dashboard.

## User preferences

Keep the storefront's current brand, colors, and compact writing style. Use MongoDB Atlas for product, order, and user application data.

## Gotchas

- Keep npm workspaces and the root `package-lock.json` as the single package setup.
- Production builds must succeed without a workflow-provided `PORT` or `BASE_PATH`.

## Pointers

- `package.json` at the root defines npm workspaces and shared build/typecheck commands.
