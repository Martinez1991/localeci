/**
 * `localeci.config.json` schema (Zod) with helpful, validated error messages.
 * See spec §2.
 */
import { z } from "zod";

export const FormatSchema = z.enum([
  "i18next",
  "next-intl",
  "json",
  "yaml",
  "po",
  "strings",
  "android",
  "fluent",
  "markdown",
  "text",
]);

export const SourceSchema = z.object({
  locale: z.string().min(1, "source.locale is required (e.g. \"en\")"),
  files: z.string().min(1, "source.files is a glob, e.g. \"locales/en/**/*.json\""),
  format: FormatSchema,
});

export const ProviderConfigSchema = z.object({
  name: z.enum(["anthropic", "openai", "mock", "cloud"]).default("anthropic"),
  /** Env var holding the provider API key (BYO-key mode). */
  apiKeyEnv: z.string().optional(),
  /** Cloud proxy base URL when name === "cloud". */
  baseUrl: z.string().url().optional(),
  /** Explicit model overrides; sensible defaults applied per provider otherwise. */
  models: z
    .object({
      cheap: z.string().optional(),
      top: z.string().optional(),
      judge: z.string().optional(),
    })
    .optional(),
});

export const QualitySchema = z.object({
  threshold: z.number().int().min(0).max(100).default(85),
  onBelowThreshold: z.enum(["flag", "fail", "skip"]).default("flag"),
  /** Back-translation cross-check (spec §5.6). Doubles cost; off by default. */
  paranoid: z.boolean().default(false),
});

export const ContextConfigSchema = z.object({
  scanCode: z.boolean().default(false),
  include: z.array(z.string()).default([]),
  /** Use the TypeScript-AST scanner when available (falls back to grep). */
  ast: z.boolean().default(true),
});

export const StyleSchema = z.object({
  tone: z.string().default("professional"),
  audience: z.string().default("SaaS product UI"),
  notes: z.string().default(""),
});

export const ConfigSchema = z.object({
  $schema: z.string().optional(),
  source: SourceSchema,
  targets: z.array(z.string().min(1)).min(1, "at least one target locale required"),
  provider: ProviderConfigSchema.default({ name: "anthropic" }),
  quality: QualitySchema.default({ threshold: 85, onBelowThreshold: "flag" }),
  glossary: z.string().optional(),
  context: ContextConfigSchema.default({ scanCode: false, include: [] }),
  style: StyleSchema.default({ tone: "professional", audience: "SaaS product UI", notes: "" }),
  /** Keep target keys whose source key disappeared instead of removing them. */
  keepOrphans: z.boolean().default(false),
  /** Batch size for translation (spec §5.3 default). */
  batchSize: z.number().int().min(1).max(100).default(25),
});

export type Config = z.infer<typeof ConfigSchema>;
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
export type StyleConfig = z.infer<typeof StyleSchema>;

/**
 * Parse and validate a raw config object, producing a friendly error message
 * that points at the offending field.
 */
export function parseConfig(raw: unknown): Config {
  const result = ConfigSchema.safeParse(raw);
  if (!result.success) {
    const lines = result.error.issues.map((i) => {
      const path = i.path.length ? i.path.join(".") : "(root)";
      return `  • ${path}: ${i.message}`;
    });
    throw new ConfigError(`Invalid localeci.config.json:\n${lines.join("\n")}`);
  }
  return result.data;
}

export class ConfigError extends Error {
  override name = "ConfigError";
}
