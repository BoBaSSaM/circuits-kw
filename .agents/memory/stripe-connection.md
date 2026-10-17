---
name: Replit Stripe connection and currency
description: How this app should access the Replit Stripe connection and handle the current KWD limitation.
---

When running in Replit without `STRIPE_SECRET_KEY`, use `@replit/connectors-sdk` to proxy Stripe API calls. The connection may be usable through the proxy even when no Stripe secret is present in Replit Secrets or returned by the connection-settings endpoint. Separate deployments such as Vercel still need a server-side `STRIPE_SECRET_KEY`; webhook processing also needs `STRIPE_WEBHOOK_SECRET`.

The storefront should offer both KWD and USD checkout. Keep catalog prices in KWD and use the user-selected fixed rate of 3.3 USD per 1 KWD for USD checkout.

**Why:** The Replit-connected Stripe account returned successful test-mode API requests through the SDK proxy, while the direct credential lookup returned no secret key.

**How to apply:** Keep keys out of logs and use the authenticated proxy in Replit. The connected test account did not support KWD, and Stripe rejected a KWD Checkout Session. Let buyers select USD as an available alternative; the Stripe account must enable KWD before KWD charges can succeed. Record the exchange rate used on each converted order.

**Why:** The user requested both KWD and USD, then specified a fixed conversion rate of 3.3.

**How to apply:** Apply the fixed rate only at checkout; do not rewrite catalog prices or silently switch to a live market rate.
