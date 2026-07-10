/**
 * Resolve a Bearer API key to an authenticated org (DB-backed). The route
 * handlers call this before proxying. Reference implementation (needs Drizzle).
 */
import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { verifyKey } from "../lib/apiKeys.js";
import { planFor } from "../lib/plans.js";
import type { AuthedOrg } from "../lib/proxy.js";

/** Extract the Bearer token from an Authorization header. */
export function bearerFrom(header: string | null): string | null {
  if (!header) return null;
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m ? m[1]!.trim() : null;
}

export async function resolveOrg(secret: string): Promise<AuthedOrg | null> {
  const prefix = secret.slice(0, 12);
  const candidates = await db.select().from(schema.apiKeys).where(eq(schema.apiKeys.prefix, prefix));
  for (const key of candidates) {
    if (key.revokedAt) continue;
    if (await verifyKey(secret, key.hash)) {
      await db
        .update(schema.apiKeys)
        .set({ lastUsedAt: new Date() })
        .where(eq(schema.apiKeys.id, key.id));
      const [org] = await db.select().from(schema.orgs).where(eq(schema.orgs.id, key.orgId));
      if (!org) return null;
      return { orgId: org.id, plan: planFor(org.plan) };
    }
  }
  return null;
}
