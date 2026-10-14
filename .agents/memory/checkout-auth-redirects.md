---
name: Checkout auth redirect preservation
description: Keep checkout as the destination while Clerk moves between internal authentication routes.
---

When buyers enter sign-in or account creation from checkout, preserve `returnTo=checkout` while Clerk navigates through internal sign-in, sign-up, and verification routes. The final redirect is recalculated as those routes change, so losing the query can send a buyer to the default account page instead.

**Why:** A real development-instance browser flow showed that Clerk drops query parameters from an internal verification route unless the app's router carries them forward.

**How to apply:** When changing Clerk router callbacks or auth routes, verify the return query survives internal navigation and that both sign-in and sign-up return to checkout with the cart intact.
