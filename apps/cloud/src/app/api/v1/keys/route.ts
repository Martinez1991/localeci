/**
 * POST /api/v1/keys — issue a new API key for the signed-in user's org.
 * The full secret is returned exactly once (spec §11).
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "../../../../auth.js";
import { db, schema } from "../../../../db/index.js";
import { generateApiKey } from "../../../../lib/apiKeys.js";

export const runtime = "nodejs";

export async function POST(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [org] = await db.select().from(schema.orgs).where(eq(schema.orgs.ownerId, session.user.id));
  if (!org) return NextResponse.json({ error: "No organization" }, { status: 400 });

  const key = await generateApiKey();
  await db.insert(schema.apiKeys).values({ orgId: org.id, hash: key.hash, prefix: key.prefix });

  // Shown once — never retrievable again.
  return NextResponse.json({ apiKey: key.secret, prefix: key.prefix });
}
