/**
 * Visual UI preview logic (spec roadmap / Scale tier). Given translated UI
 * strings tagged with the element they render in, estimate whether the
 * translation will fit — the data behind the cloud's per-language preview that
 * highlights layout overflow before it ships.
 *
 * Pure and framework-free so it is unit-tested here; the Next.js route/page are
 * thin renderers over `previewStrings`.
 */
export type ElementKind =
  | "button"
  | "nav"
  | "title"
  | "heading"
  | "label"
  | "tooltip"
  | "badge"
  | "placeholder"
  | "text";

/** Comfortable character budget per element before layout overflow risk. */
const BUDGET: Record<ElementKind, number> = {
  button: 18,
  nav: 14,
  badge: 12,
  label: 24,
  placeholder: 30,
  title: 45,
  heading: 45,
  tooltip: 60,
  text: 80,
};

export type FitStatus = "fits" | "tight" | "overflow";

export interface PreviewItem {
  key: string;
  source: string;
  target: string;
  kind: ElementKind;
}

export interface PreviewResult {
  key: string;
  kind: ElementKind;
  sourceLen: number;
  targetLen: number;
  ratio: number;
  budget: number;
  status: FitStatus;
  note?: string;
}

/** Visible length, ignoring ICU/placeholder markup so budgets reflect rendered text. */
export function displayLength(text: string): number {
  return text
    .replace(/\{[^}]*\}|<\/?[^>]+>|%[\d$]*[sdfeg@]/g, "•")
    .trim().length;
}

export function previewString(item: PreviewItem): PreviewResult {
  const budget = BUDGET[item.kind] ?? BUDGET.text;
  const sourceLen = displayLength(item.source);
  const targetLen = displayLength(item.target);
  const ratio = sourceLen === 0 ? 1 : targetLen / sourceLen;

  let status: FitStatus;
  if (targetLen <= budget) status = "fits";
  else if (targetLen <= budget * 1.25) status = "tight";
  else status = "overflow";

  const result: PreviewResult = { key: item.key, kind: item.kind, sourceLen, targetLen, ratio: Number(ratio.toFixed(2)), budget, status };

  if (status !== "overflow" && sourceLen <= budget && ratio > 1.4) {
    result.note = `expands ${Math.round((ratio - 1) * 100)}% vs source — check tight layouts`;
  }
  if (status === "overflow") {
    result.note = `~${targetLen} chars exceeds the ~${budget}-char ${item.kind} budget`;
  }
  return result;
}

export interface PreviewSummary {
  locale: string;
  items: PreviewResult[];
  fits: number;
  tight: number;
  overflow: number;
}

export function previewStrings(locale: string, items: PreviewItem[]): PreviewSummary {
  const results = items.map(previewString);
  return {
    locale,
    items: results,
    fits: results.filter((r) => r.status === "fits").length,
    tight: results.filter((r) => r.status === "tight").length,
    overflow: results.filter((r) => r.status === "overflow").length,
  };
}
