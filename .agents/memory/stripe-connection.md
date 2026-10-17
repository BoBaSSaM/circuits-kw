---
name: Replit Stripe connection and USD pricing
description: How this app accesses Stripe and converts KWD catalog prices to USD-only customer pricing.
---

Use the official Stripe SDK with a server-side `STRIPE_SECRET_KEY` in every environment, including Replit and Vercel. Do not rely on Replit's connector SDK for the checkout path. Webhook processing also needs `STRIPE_WEBHOOK_SECRET`.

The storefront and new checkout orders are USD-only. Keep product and supplier source prices in KWD internally, and convert customer-facing unit prices at the fixed rate of 3.3 USD per 1 KWD. Round each converted unit to USD cents before multiplying by quantity.

**Why:** Vercel cannot provide Replit connector credentials, and a hard import of the connector SDK caused production bundling failures. The user requested direct Stripe initialization from environment variables.

**How to apply:** Keep keys out of logs. Configure `STRIPE_SECRET_KEY` wherever checkout or verification runs and `STRIPE_WEBHOOK_SECRET` wherever the webhook is enabled. Stripe Checkout uses USD. Convert prices entered in the USD admin forms back to KWD before saving catalog data; record the fixed rate on each new order. Do not bulk-rewrite existing catalog records.

**Why:** The user requested a USD-only storefront and specified converting all KWD prices by 3.3.

**How to apply:** Display USD throughout the storefront and dashboard. Keep KWD only for supplier imports and canonical catalog storage; never silently switch to a live market rate.
