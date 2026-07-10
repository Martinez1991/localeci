/** Drizzle-backed UsageStore (reference implementation). */
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import type { UsageStore, UsageEvent } from "../lib/usage.js";

export class DbUsageStore implements UsageStore {
  async record(event: UsageEvent): Promise<void> {
    await db.insert(schema.usageEvents).values({
      orgId: event.orgId,
      period: event.period,
      stringsTranslated: event.stringsTranslated,
      tokensIn: event.tokensIn,
      tokensOut: event.tokensOut,
      model: event.model,
      locale: event.locale,
      contentHash: event.contentHash ?? null,
    });
  }

  async usedInPeriod(orgId: string, period: string): Promise<number> {
    const [row] = await db
      .select({ total: sql<number>`coalesce(sum(${schema.usageEvents.stringsTranslated}), 0)` })
      .from(schema.usageEvents)
      .where(and(eq(schema.usageEvents.orgId, orgId), eq(schema.usageEvents.period, period)));
    return Number(row?.total ?? 0);
  }
}
