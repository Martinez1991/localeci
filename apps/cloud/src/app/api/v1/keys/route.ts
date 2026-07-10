/**
 * POST /api/v1/keys — thin adapter over the tested `handleKeyCreation`
 * orchestration (issue #12). Logic (resolve org → authorize admin → generate →
 * persist → audit) lives in src/lib/handlers/keyHandler.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "../../../../auth.js";
import { db, schema } from "../../../../db/index.js";
import { generateApiKey } from "../../../../lib/apiKeys.js";
import { handleKeyCreation, type OrgLookup, type KeyStore } from "../../../../lib/handlers/keyHandler.js";
import { DbMembershipStore } from "../../../../server/membership.js";
import { audit } from "../../../../server/audit.js";
import { enforceRateLimit } from "../../../../server/guard.js";

export const runtime = "nodejs";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  const limited = await enforceRateLimit(req, "write", { subjectId: session?.user?.id });
  if (limited) return limited;

  const body = (await req.json().catch(() => ({}))) as { orgId?: string };
  const orgs: OrgLookup = {
    async ownedOrgId(userId) {
      const [org] = await db.select().from(schema.orgs).where(eq(schema.orgs.ownerId, userId));
      return org?.id ?? null;
    },
  };
  const keys: KeyStore = {
    async insert(orgId, hash, prefix) {
      await db.insert(schema.apiKeys).values({ orgId, hash, prefix });
    },
  };

  const result = await handleKeyCreation(session?.user?.id, body.orgId, {
    memberships: new DbMembershipStore(),
    orgs,
    keys,
    audit: { record: audit },
    genKey: generateApiKey,
    nowIso: new Date().toISOString(),
  });
  return NextResponse.json(result.body, { status: result.status });
}
