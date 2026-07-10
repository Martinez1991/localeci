/**
 * API-key creation orchestration (issue #12). Thin route over this DI'd function
 * so the resolve-org → authorize(admin) → generate → persist → audit flow is
 * unit-tested.
 */
import { requireOrgAccess, ForbiddenError, UnauthorizedError, type MembershipStore } from "../authz.js";
import type { AuditInput } from "../audit.js";
import type { HandlerResult } from "./reviewHandler.js";

export interface OrgLookup {
  /** The org owned by a user, if any (back-compat for keyless callers). */
  ownedOrgId(userId: string): Promise<string | null>;
}
export interface KeyStore {
  insert(orgId: string, hash: string, prefix: string): Promise<void>;
}
export interface Auditor {
  record(input: AuditInput): Promise<void>;
}
export interface GeneratedKeyLike {
  secret: string;
  prefix: string;
  hash: string;
}

export interface KeyHandlerDeps {
  memberships: MembershipStore;
  orgs: OrgLookup;
  keys: KeyStore;
  audit: Auditor;
  genKey: () => Promise<GeneratedKeyLike>;
  nowIso: string;
}

export async function handleKeyCreation(
  userId: string | undefined | null,
  requestedOrgId: string | undefined,
  deps: KeyHandlerDeps,
): Promise<HandlerResult> {
  if (!userId) return { status: 401, body: { error: "Unauthorized" } };

  let orgId = requestedOrgId;
  if (!orgId) {
    orgId = (await deps.orgs.ownedOrgId(userId)) ?? undefined;
    if (!orgId) return { status: 400, body: { error: "No organization" } };
  }

  try {
    await requireOrgAccess(deps.memberships, userId, orgId, "admin");
  } catch (e) {
    const status = e instanceof ForbiddenError || e instanceof UnauthorizedError ? e.status : 403;
    return { status, body: { error: (e as Error).message } };
  }

  const key = await deps.genKey();
  await deps.keys.insert(orgId, key.hash, key.prefix);
  await deps.audit.record({ actorId: userId, orgId, action: "apikey.created", target: key.prefix, at: deps.nowIso });

  return { status: 200, body: { apiKey: key.secret, prefix: key.prefix } };
}
