/**
 * Minimal GitHub REST helpers (no octokit dep). Enough to upsert a single PR
 * comment identified by a hidden marker.
 */
export interface GitHubContext {
  token: string;
  apiUrl: string; // e.g. https://api.github.com
  owner: string;
  repo: string;
  prNumber: number;
  fetchImpl?: typeof fetch;
}

interface Comment {
  id: number;
  body: string;
}

async function api(ctx: GitHubContext, method: string, path: string, body?: unknown): Promise<unknown> {
  const doFetch = ctx.fetchImpl ?? fetch;
  const resp = await doFetch(`${ctx.apiUrl}${path}`, {
    method,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${ctx.token}`,
      "x-github-api-version": "2022-11-28",
      "content-type": "application/json",
      "user-agent": "localeci-action",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!resp.ok) {
    throw new Error(`GitHub API ${method} ${path} → ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  }
  const text = await resp.text();
  return text ? JSON.parse(text) : null;
}

/** Upsert (create or update) the LocaleCI comment identified by `marker`. */
export async function upsertComment(ctx: GitHubContext, marker: string, body: string): Promise<void> {
  const comments = (await api(
    ctx,
    "GET",
    `/repos/${ctx.owner}/${ctx.repo}/issues/${ctx.prNumber}/comments?per_page=100`,
  )) as Comment[];

  const existing = comments.find((c) => c.body.includes(marker));
  if (existing) {
    await api(ctx, "PATCH", `/repos/${ctx.owner}/${ctx.repo}/issues/comments/${existing.id}`, { body });
  } else {
    await api(ctx, "POST", `/repos/${ctx.owner}/${ctx.repo}/issues/${ctx.prNumber}/comments`, { body });
  }
}
