---
name: Circuits KW catalog database
description: The intended database target for product and project-kit catalog data.
---

Seed Circuits KW catalog data to MongoDB Atlas through the `MONGODB_URL` secret, using the app's `circuits_kw` database. Do not write catalog records to MongoDB's system `local` database or substitute Replit PostgreSQL just because the scaffold includes it.

**Why:** The user showed MongoDB Atlas Data Explorer and clarified that data was missing there after a previous seed went to Replit PostgreSQL.

**How to apply:** For catalog seeding or inspection, use the Atlas connection and the app database/collections. Never print or request the connection string in chat.
