# Shop Project — Agent Skill

Read this file before every task. Follow it exactly. If a request conflicts with this file, ask before doing it.

---

## 1. About the project

- This project is an online shop.
- If the project already has a design (colors, fonts, logo, layout), keep it and use it on every new page.
- If there is no design yet, ask the user for the shop name, what it sells and the style they want before building the pages.
- Keep the design consistent across all screens.

---

## 2. Stack (do not change)

| Part | Use |
|---|---|
| Framework | Next.js (App Router) with TypeScript |
| Styling | Tailwind CSS |
| Database | MongoDB Atlas, using Mongoose |
| Passwords | bcryptjs (hash before saving) |
| Login sessions | JWT stored in an httpOnly cookie |
| Payments (Day 5) | Stripe, test mode only |
| Deployment (Day 5) | Vercel, from GitHub |

Do NOT:
- Use Replit's built-in database, PostgreSQL, SQLite or any other database
- Use Replit Auth or any third-party login service
- Add a separate Express server — use Next.js API routes (`app/api/...`)
- Switch frameworks or add large libraries without asking first

---

## 3. Secrets and security (always)

- All secrets live in **Replit Secrets** (environment variables). Never write a key, password or connection string in the code.
- Required secrets:
  - `MONGODB_URI` — MongoDB Atlas connection string
  - `JWT_SECRET` — any long random string
  - `STRIPE_SECRET_KEY` — added on Day 5
  - `STRIPE_WEBHOOK_SECRET` — added on Day 5 (bonus)
- Secrets are only used on the server (API routes and server code). Never use them in client components.
- Never store plain passwords. Always hash with bcryptjs.
- Never return password hashes in any API response.
- Add `.env*` to `.gitignore`.
- If a required secret is missing, stop and tell the user exactly which secret to add in Replit Secrets and where to get it.

---

## 4. Database rules

- Create one shared connection helper at `lib/db.ts` that **reuses the connection** (cache it globally). This is required so it works on Vercel.
- Put each model in `models/`:
  - `User` — name, email (unique), passwordHash, createdAt
  - `Product` — name, description, price, image, category, createdAt
  - `Order` — user (ref User), items (product, quantity, price), total, status (`pending` / `paid`), createdAt
- Products must come from the database, not be hardcoded in the page.
- Add a simple seed script or admin route to add a few sample products.

---

## 5. Build order (one step at a time)

Build in this order. Finish and test each step before starting the next. After each step, tell me what you changed and how to test it.

**Day 4**
1. Set up the Next.js project with Tailwind, using the project's existing design (see section 1).
2. Build the pages: Home (hero + featured products), Products, Product details, Cart.
3. Connect MongoDB (`lib/db.ts`) and create the models.
4. Load products from the database.
5. Sign up page + API route (hash the password, save the user).
6. Log in page + API route (check the hash, set the JWT cookie).
7. Log out + show the logged-in user's name in the navigation.
8. Bonus: protected routes — only logged-in users can see "My Orders", and they only see their own orders.

**Day 5**
9. Stripe Checkout (test mode) for the cart. Create the checkout session on the server only.
10. Success and cancel pages.
11. Bonus: Stripe webhook that marks the order as `paid` in the database.

---

## 6. Folder structure

```
app/
  page.tsx              → Home
  products/             → Product list + details
  cart/                 → Cart
  login/  signup/       → Auth pages
  orders/               → My Orders (protected)
  api/
    auth/               → signup, login, logout, me
    products/           → product routes
    checkout/           → Stripe (Day 5)
    webhook/            → Stripe webhook (Day 5)
components/             → Reusable UI (Navbar, ProductCard, Button...)
lib/                    → db.ts, auth helpers
models/                 → User, Product, Order
```

---

## 7. Quality rules

- **Responsive:** every page must work on mobile first, then desktop.
- **Feedback:** show loading states, success messages and clear error messages (never a blank screen).
- **Errors:** every API route handles errors and returns the right status code (200, 201, 400, 401, 403, 404, 500).
- **Forms:** validate inputs (empty fields, email format, password at least 8 characters).
- **Small steps:** change only what the current step needs. Do not rewrite working parts.
- **Explain simply:** after each change, explain in 2–3 short sentences what you did, in plain language for a beginner.
