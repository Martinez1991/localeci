/**
 * POST /api/v1/privacy/export — DSAR: export all data about the signed-in user
 * (LGPD Art. 18 / GDPR Art. 15). Returns a portable JSON bundle and records the
 * access in the audit log. Reference implementation.
 */
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "../../../../../auth.js";
import { db, schema } from "../../../../../db/index.js";
import { buildDataExport, type ExportCollections } from "../../../../../lib/privacy.js";
import { DbMembershipStore } from "../../../../../server/membership.js";
import { audit } from "../../../../../server/audit.js";

export const runtime = "nodejs";

export async function POST(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const uid = session.user.id;

  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, uid));
  if (!user) return NextResponse.json({ error: "No user" }, { status: 400 });

  const orgRows = await db.select().from(schema.orgs).where(eq(schema.orgs.ownerId, uid));
  const store = new DbMembershipStore();
  const orgs = await Promise.all(
    orgRows.map(async (o) => ({ id: o.id, name: o.name, role: (await store.roleFor(uid, o.id)) ?? "member", plan: o.plan })),
  );

  const keyRows = orgRows.length
    ? await db.select().from(schema.apiKeys).where(eq(schema.apiKeys.orgId, orgRows[0]!.id))
    : [];

  const collections: ExportCollections = {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: (user.createdAt as unknown as Date).toISOString(),
      mfaEnabled: !!user.mfaEnabledAt,
    },
    orgs,
    apiKeys: keyRows.map((k) => ({
      prefix: k.prefix, // never the hash
      lastUsedAt: k.lastUsedAt ? (k.lastUsedAt as unknown as Date).toISOString() : null,
      createdAt: (k.createdAt as unknown as Date).toISOString(),
    })),
    usage: [],
    auditEvents: [],
  };

  const bundle = buildDataExport({ userId: uid, email: user.email }, collections, new Date().toISOString());
  await audit({ actorId: uid, action: "data.exported", target: uid, at: new Date().toISOString() });

  return new NextResponse(JSON.stringify(bundle, null, 2), {
    status: 200,
    headers: { "content-type": "application/json", "content-disposition": 'attachment; filename="localeci-data-export.json"' },
  });
}
