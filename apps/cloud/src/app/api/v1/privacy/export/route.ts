/**
 * POST /api/v1/privacy/export — DSAR (LGPD Art. 18 / GDPR Art. 15). Thin adapter
 * over the tested `handlePrivacyExport` orchestration (#12/#16).
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "../../../../../auth.js";
import { db, schema } from "../../../../../db/index.js";
import { handlePrivacyExport, type ExportGatherer } from "../../../../../lib/handlers/privacyHandler.js";
import { DbMembershipStore } from "../../../../../server/membership.js";
import { audit } from "../../../../../server/audit.js";
import type { ExportCollections } from "../../../../../lib/privacy.js";

export const runtime = "nodejs";

export async function POST(): Promise<NextResponse> {
  const session = await auth();

  const gatherer: ExportGatherer = {
    async gather(uid) {
      const [user] = await db.select().from(schema.users).where(eq(schema.users.id, uid));
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
          id: user!.id,
          email: user!.email,
          name: user!.name,
          createdAt: (user!.createdAt as unknown as Date).toISOString(),
          mfaEnabled: !!user!.mfaEnabledAt,
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
      return { email: user!.email, collections };
    },
  };

  const result = await handlePrivacyExport(session?.user?.id, { gatherer, audit: { record: audit }, nowIso: new Date().toISOString() });
  if (result.status !== 200) return NextResponse.json(result.body, { status: result.status });

  return new NextResponse(JSON.stringify(result.body, null, 2), {
    status: 200,
    headers: { "content-type": "application/json", "content-disposition": 'attachment; filename="localeci-data-export.json"' },
  });
}
