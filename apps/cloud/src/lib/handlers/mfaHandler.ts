/**
 * MFA enroll/verify orchestration (issues #12, #15). Thin route over this DI'd
 * function so the enroll → store-secret and verify → enable flow is tested.
 */
import { generateSecret, otpauthUri, verifyTotp } from "../totp.js";
import type { HandlerResult } from "./reviewHandler.js";

export interface MfaUserStore {
  get(userId: string): Promise<{ email: string; mfaSecret: string | null; mfaEnabledAt: Date | null } | null>;
  setSecret(userId: string, secret: string): Promise<void>;
  enable(userId: string): Promise<void>;
}

export interface MfaAction {
  action: "enroll" | "verify";
  code?: string;
}

export async function handleMfa(
  userId: string | undefined | null,
  input: MfaAction,
  deps: {
    users: MfaUserStore;
    // Injectable for deterministic tests; default to the real primitives.
    genSecret?: () => string;
    verify?: (secret: string, code: string) => boolean;
  },
): Promise<HandlerResult> {
  if (!userId) return { status: 401, body: { error: "Unauthorized" } };
  const user = await deps.users.get(userId);
  if (!user) return { status: 400, body: { error: "No user" } };

  if (input.action === "enroll") {
    const secret = (deps.genSecret ?? generateSecret)();
    await deps.users.setSecret(userId, secret);
    return { status: 200, body: { secret, otpauthUri: otpauthUri(secret, user.email) } };
  }

  if (input.action === "verify") {
    if (!user.mfaSecret) return { status: 400, body: { error: "Enroll first" } };
    const ok = input.code ? (deps.verify ?? verifyTotp)(user.mfaSecret, input.code) : false;
    if (!ok) return { status: 401, body: { error: "Invalid code" } };
    await deps.users.enable(userId);
    return { status: 200, body: { enabled: true } };
  }

  return { status: 400, body: { error: "Unknown action" } };
}
