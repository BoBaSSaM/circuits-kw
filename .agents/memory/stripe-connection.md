---
name: Replit Stripe connection and USD pricing
description: How this app accesses Stripe and converts KWD catalog prices to USD-only customer pricing.
---

When running in Replit without `STRIPE_SECRET_KEY`, use `@replit/connectors-sdk` to proxy Stripe API calls. The connection may be usable through the proxy even when no Stripe secret is present in Replit Secrets or returned by the connection-settings endpoint. Separate deployments such as Vercel still need a server-side `STRIPE_SECRET_KEY`; webhook processing also needs `STRIPE_WEBHOOK_SECRET`.

The storefront and new checkout orders are USD-only. Keep product and supplier source prices in KWD internally, and convert customer-facing unit prices at the fixed rate of 3.3 USD per 1 KWD. Round each converted unit to USD cents before multiplying by quantity.

**Why:** The Replit-connected Stripe account returned successful test-mode API requests through the SDK proxy, while the direct credential lookup returned no secret key.

**How to apply:** Keep keys out of logs and use the authenticated proxy in Replit. The connected test account did not support KWD, so Stripe Checkout uses USD. Convert prices entered in the USD admin forms back to KWD before saving catalog data; record the fixed rate on each new order. Do not bulk-rewrite existing catalog records.

**Why:** The user requested a USD-only storefront and specified converting all KWD prices by 3.3.

**How to apply:** Display USD throughout the storefront and dashboard. Keep KWD only for supplier imports and canonical catalog storage; never silently switch to a live market rate.
