/**
 * App store field character limits (spec roadmap: app store metadata).
 *
 * Maps a Fastlane metadata filename to its store's hard character limit so a
 * translation that would be rejected by App Store Connect / Google Play is
 * flagged before submission.
 */
const LIMITS: Record<string, number> = {
  // Apple App Store
  "name.txt": 30,
  "subtitle.txt": 30,
  "promotional_text.txt": 170,
  "keywords.txt": 100,
  "description.txt": 4000,
  "release_notes.txt": 4000,
  // Google Play
  "title.txt": 30,
  "short_description.txt": 80,
  "full_description.txt": 4000,
};

/** Character limit for a metadata field file, or null if not a known field. */
export function storeFieldLimit(filename: string): number | null {
  const base = filename.replace(/\\/g, "/").split("/").pop() ?? filename;
  return LIMITS[base.toLowerCase()] ?? null;
}

export interface StoreLimitCheck {
  ok: boolean;
  limit: number;
  length: number;
  over: number;
}

/** Check a translated field's length against its store limit. */
export function checkStoreLimit(filename: string, text: string): StoreLimitCheck | null {
  const limit = storeFieldLimit(filename);
  if (limit === null) return null;
  const length = text.trim().length;
  return { ok: length <= limit, limit, length, over: Math.max(0, length - limit) };
}
