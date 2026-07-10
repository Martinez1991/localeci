/**
 * Drizzle schema (spec §8). Postgres (Neon). Essential tables only.
 *
 * Reference implementation — requires `drizzle-orm` at deploy time (see the
 * cloud README). Not part of the monorepo typecheck to keep CI light.
 */
import { pgTable, text, timestamp, integer, bigint, pgEnum, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";

export const planEnum = pgEnum("plan", ["free", "pro", "team", "scale"]);

export const users = pgTable("users", {
  id: text("id").primaryKey().$defaultFn(createId),
  githubId: text("github_id").notNull().unique(),
  email: text("email").notNull(),
  name: text("name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const orgs = pgTable("orgs", {
  id: text("id").primaryKey().$defaultFn(createId),
  name: text("name").notNull(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id),
  plan: planEnum("plan").notNull().default("free"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubId: text("stripe_sub_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const apiKeys = pgTable(
  "api_keys",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    orgId: text("org_id")
      .notNull()
      .references(() => orgs.id),
    hash: text("hash").notNull(),
    prefix: text("prefix").notNull(), // e.g. lcx_live_abc — shown once, then only prefix
    lastUsedAt: timestamp("last_used_at"),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({ prefixIdx: index("api_keys_prefix_idx").on(t.prefix) }),
);

export const usageEvents = pgTable(
  "usage_events",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    orgId: text("org_id")
      .notNull()
      .references(() => orgs.id),
    period: text("period").notNull(), // YYYY-MM
    stringsTranslated: integer("strings_translated").notNull().default(0),
    tokensIn: bigint("tokens_in", { mode: "number" }).notNull().default(0),
    tokensOut: bigint("tokens_out", { mode: "number" }).notNull().default(0),
    model: text("model").notNull(),
    locale: text("locale").notNull(),
    // Zero-retention: NO text column ever. Optional content hash only.
    contentHash: text("content_hash"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    orgPeriodIdx: index("usage_org_period_idx").on(t.orgId, t.period),
  }),
);
