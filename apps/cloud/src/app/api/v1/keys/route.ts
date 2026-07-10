/**
 * POST /api/v1/keys — issue a new API key for an org the caller administers.
 * Authorized against the target org (admin+), fixing the previous owner-only
 * assumption and aligning with RBAC. The full secret is returned exactly once.
 */
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "../../../../auth.js";
import { db, schema } from "../../../../db/index.js";
import { generateApiKey } from "../../../../lib/apiKeys.js";
import { requireOrgAccess, ForbiddenError, UnauthorizedError } from "../../../../lib/authz.js";
import { DbMembershipStore } from "../../../../server/membership.js";
import { audit } from "../../../../server/audit.js";

export const runtime = "nodejs";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Target org: explicit orgId, else the caller's owned org (back-compat).
  const body = (await req.json().catch(() => ({}))) as { orgId?: string };
  let orgId = body.orgId;
  if (!orgId) {
    const [org] = await db.select().from(schema.orgs).where(eq(schema.orgs.ownerId, session.user.id));
    if (!org) return NextResponse.json({ error: "No organization" }, { status: 400 });
    orgId = org.id;
  }

  try {
    await requireOrgAccess(new DbMembershipStore(), session.user.id, orgId, "admin");
  } catch (e) {
    const status = e instanceof ForbiddenError || e instanceof UnauthorizedError ? e.status : 403;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }

  const key = await generateApiKey();
  await db.insert(schema.apiKeys).values({ orgId, hash: key.hash, prefix: key.prefix });
  await audit({ actorId: session.user.id, orgId, action: "apikey.created", target: key.prefix, at: new Date().toISOString() });

  // Shown once — never retrievable again.
  return NextResponse.json({ apiKey: key.secret, prefix: key.prefix });
}
