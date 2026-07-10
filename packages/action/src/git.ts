/**
 * Git commit/push helper (the `git-auto-commit` pattern). The commit message
 * carries `[skip-localeci]` so the resulting push does not re-trigger the
 * workflow into an infinite loop (spec §7).
 */
import { execFileSync } from "node:child_process";

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

export interface CommitOptions {
  cwd: string;
  files: string[];
  locales: string[];
  branch: string;
  authorName?: string;
  authorEmail?: string;
}

/** Stage the changed files, commit, and push to the PR branch. Returns true if
 *  a commit was created. */
export function commitAndPush(opts: CommitOptions): boolean {
  const { cwd, files, locales, branch } = opts;
  if (files.length === 0) return false;

  const name = opts.authorName ?? "localeci[bot]";
  const email = opts.authorEmail ?? "localeci-bot@users.noreply.github.com";

  git(cwd, ["config", "user.name", name]);
  git(cwd, ["config", "user.email", email]);
  git(cwd, ["add", "--", ...files]);

  // Nothing staged? (e.g. content identical) → skip.
  const status = git(cwd, ["status", "--porcelain"]).trim();
  if (status === "") return false;

  const count = files.filter((f) => !f.endsWith("localeci.lock.json")).length;
  const msg = `chore(i18n): translate ${count} file(s) to ${locales.join(", ")} [skip-localeci]`;
  git(cwd, ["commit", "-m", msg]);
  git(cwd, ["push", "origin", `HEAD:${branch}`]);
  return true;
}
