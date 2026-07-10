/**
 * Read-replica Drizzle client (issue #18). Point dashboard/usage/analytics reads
 * at a Neon read replica to take load off the primary. Falls back to the primary
 * when no replica is configured. Reference implementation.
 */
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema.js";
import { db as primary } from "./index.js";

const replicaUrl = process.env.DATABASE_URL_REPLICA;
export const dbRead = replicaUrl ? drizzle(neon(replicaUrl), { schema }) : primary;
