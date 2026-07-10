/**
 * Drizzle schema (spec §8). Postgres (Neon). Essential tables only.
 *
 * Reference implementation — requires `drizzle-orm` at deploy time (see the
 * cloud README). Not part of the monorepo typecheck to keep CI light.
 */
import { pgTable, text, timestamp, integer, bigint, jsonb, pgEnum, uniqueIndex, index, vector } from "drizzle-orm/pg-core";
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

/**
 * Semantic translation memory (pgvector). Requires `CREATE EXTENSION vector;`.
 * Embedding dimension matches text-embedding-3-small (1536). One row per
 * approved (org, locale, source).
 */
export const translationVectors = pgTable(
  "translation_vectors",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    orgId: text("org_id")
      .notNull()
      .references(() => orgs.id),
    locale: text("locale").notNull(),
    source: text("source").notNull(),
    target: text("target").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    orgLocaleSource: uniqueIndex("tv_org_locale_source_idx").on(t.orgId, t.locale, t.source),
    // Approximate NN index for cosine distance.
    embIdx: index("tv_embedding_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
  }),
);

export const roleEnum = pgEnum("member_role", ["owner", "admin", "member"]);

/** Organization membership + RBAC (fixes single-owner limitation; enables Team/Scale). */
export const orgMembers = pgTable(
  "org_members",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    orgId: text("org_id")
      .notNull()
      .references(() => orgs.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    role: roleEnum("role").notNull().default("member"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({ orgUser: uniqueIndex("org_members_org_user_idx").on(t.orgId, t.userId) }),
);

export const inviteStatusEnum = pgEnum("invite_status", ["pending", "accepted", "revoked", "expired"]);

/** Pending invitations to join an org (issue #14). */
export const orgInvites = pgTable(
  "org_invites",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    orgId: text("org_id")
      .notNull()
      .references(() => orgs.id),
    email: text("email").notNull(),
    role: roleEnum("role").notNull().default("member"),
    token: text("token").notNull().unique(),
    status: inviteStatusEnum("status").notNull().default("pending"),
    invitedById: text("invited_by_id").references(() => users.id),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({ orgEmailIdx: index("org_invites_org_email_idx").on(t.orgId, t.email) }),
);

export const reviewStatusEnum = pgEnum("review_status", ["pending", "approved", "edited", "rejected"]);

/** Collaborative web review queue (spec: review workflow). One row per flagged
 *  string awaiting a human decision. */
export const reviews = pgTable(
  "reviews",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    orgId: text("org_id")
      .notNull()
      .references(() => orgs.id),
    batch: text("batch").notNull(), // e.g. repo#PR or a run id
    key: text("key").notNull(),
    locale: text("locale").notNull(),
    source: text("source").notNull(),
    machineTarget: text("machine_target").notNull(),
    score: integer("score").notNull(),
    status: reviewStatusEnum("status").notNull().default("pending"),
    finalTarget: text("final_target"),
    reviewerId: text("reviewer_id").references(() => users.id),
    reviewedAt: timestamp("reviewed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({ orgBatchIdx: index("reviews_org_batch_idx").on(t.orgId, t.batch, t.status) }),
);

export const jobStatusEnum = pgEnum("job_status", ["queued", "leased", "done", "failed"]);

/** Persistent job queue for the translation proxy (spec §13). Workers claim
 *  jobs with `FOR UPDATE SKIP LOCKED` and a lease-based visibility timeout. */
export const jobs = pgTable(
  "jobs",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    orgId: text("org_id").references(() => orgs.id),
    kind: text("kind").notNull().default("translate"),
    payload: jsonb("payload").notNull(),
    status: jobStatusEnum("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(4),
    nextRunAt: timestamp("next_run_at").notNull().defaultNow(),
    leaseUntil: timestamp("lease_until"),
    error: text("error"),
    result: jsonb("result"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({ runnableIdx: index("jobs_runnable_idx").on(t.status, t.nextRunAt) }),
);
