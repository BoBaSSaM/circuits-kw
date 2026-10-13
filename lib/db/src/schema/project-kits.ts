import {
  boolean,
  numeric,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const projectKits = pgTable("project_kits", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  level: text("level").notNull(),
  domain: text("domain").notNull(),
  duration: text("duration").notNull(),
  price: numeric("price", { precision: 10, scale: 3 }).notNull(),
  description: text("description").notNull(),
  parts: text("parts").array().notNull(),
  itemCountLabel: text("item_count_label").notNull(),
  manualNotes: text("manual_notes").notNull(),
  icon: text("icon").notNull(),
  isDemo: boolean("is_demo").notNull().default(true),
  seedSource: text("seed_source").notNull().default("circuits-kw-demo"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type ProjectKit = typeof projectKits.$inferSelect;
export type NewProjectKit = typeof projectKits.$inferInsert;
