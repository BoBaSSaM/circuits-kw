---
name: Checkout auth redirect preservation
description: Keep checkout as the destination while Clerk moves between internal authentication routes.
---

When buyers enter sign-in or account creation from checkout, preserve `returnTo=checkout` while Clerk navigates through internal sign-in, sign-up, and verification routes. The final redirect is recalculated as those routes change, so losing the query can send a buyer to the default account page instead.

**Why:** A real development-instance browser flow showed that Clerk drops query parameters from an internal verification route unless the app's router carries them forward.

**How to apply:** When changing Clerk router callbacks or auth routes, verify the return query survives internal navigation and that both sign-in and sign-up return to checkout with the cart intact.

Clerk's browser-based email-verification flow can intermittently stall before the app's redirect is exercised in the development test instance. A verification timeout alone does not establish a redirect regression; distinguish provider verification from the app landing route when diagnosing auth-browser failures.

**Why:** Repeated runs of the same browser flow failed during verification and then passed without an application change.

**How to apply:** When an auth-browser test times out before its destination assertion, identify whether Clerk completed verification before changing redirect code.
