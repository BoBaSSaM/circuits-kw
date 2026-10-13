import {
  boolean,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const catalogProducts = pgTable("catalog_products", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  sku: text("sku").notNull().unique(),
  category: text("category").notNull(),
  price: numeric("price", { precision: 10, scale: 3 }).notNull(),
  stock: integer("stock").notNull().default(0),
  package: text("package").notNull(),
  description: text("description").notNull(),
  voltage: text("voltage").notNull(),
  interface: text("interface").notNull(),
  icon: text("icon").notNull(),
  isDemo: boolean("is_demo").notNull().default(true),
  seedSource: text("seed_source").notNull().default("circuits-kw-demo"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type CatalogProduct = typeof catalogProducts.$inferSelect;
export type NewCatalogProduct = typeof catalogProducts.$inferInsert;
