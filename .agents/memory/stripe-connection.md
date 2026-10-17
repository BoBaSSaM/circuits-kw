---
name: Replit Stripe connection and currency
description: How this app should access the Replit Stripe connection and handle the current KWD limitation.
---

When running in Replit without `STRIPE_SECRET_KEY`, use `@replit/connectors-sdk` to proxy Stripe API calls. The connection may be usable through the proxy even when no Stripe secret is present in Replit Secrets or returned by the connection-settings endpoint. Separate deployments such as Vercel still need a server-side `STRIPE_SECRET_KEY`; webhook processing also needs `STRIPE_WEBHOOK_SECRET`.

**Why:** The Replit-connected Stripe account returned successful test-mode API requests through the SDK proxy, while the direct credential lookup returned no secret key.

**How to apply:** Keep keys out of logs and use the authenticated proxy in Replit. The connected test account did not support KWD, and Stripe rejected a KWD Checkout Session. Do not change or convert catalog prices automatically; the account must enable KWD or the user must choose a supported checkout currency and provide a pricing/conversion policy.
