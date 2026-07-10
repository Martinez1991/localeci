/** `localeci init` — detect the i18n setup and write a filled config. */
import { writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { log, c } from "../lib/output.js";
import { detectProject } from "../lib/detect.js";
import { findConfigPath } from "../lib/project.js";

export interface InitOptions {
  cwd: string;
  force?: boolean;
}

export async function cmdInit(opts: InitOptions): Promise<number> {
  const { cwd } = opts;
  const existing = findConfigPath(cwd);
  if (existing && !opts.force) {
    log.warn(`Config already exists at ${c.bold(existing)}. Re-run with --force to overwrite.`);
    return 1;
  }

  log.step("Detecting your i18n setup…");
  const detection = await detectProject(cwd);

  if (!detection) {
    log.warn("Couldn't auto-detect a locale folder (looked for locales/, i18n/, messages/, lang/).");
    log.info("Writing a template config you can edit:");
    writeConfig(cwd, {
      source: { locale: "en", files: "locales/en/**/*.json", format: "i18next" },
      targets: ["pt-BR", "es", "de"],
    });
    return 0;
  }

  log.success(`Detected ${c.bold(detection.lib ?? "i18n")} · format ${c.bold(detection.format)} · source ${c.bold(detection.sourceLocale)}`);
  log.dim(`  files: ${detection.filesGlob}`);
  log.dim(`  targets: ${detection.targetsGuess.join(", ")}`);

  writeConfig(cwd, {
    source: { locale: detection.sourceLocale, files: detection.filesGlob, format: detection.format },
    targets: detection.targetsGuess,
    context: { scanCode: true, include: detection.scanInclude },
  });

  log.info("");
  log.success(`Wrote ${c.bold("localeci.config.json")}`);
  log.info(`Next: ${c.cyan("npx localeci translate")}  (set your provider key, e.g. ${c.dim("ANTHROPIC_API_KEY")}, or use ${c.dim("--mock")})`);
  return 0;
}

interface ConfigShape {
  source: { locale: string; files: string; format: string };
  targets: string[];
  context?: { scanCode: boolean; include: string[] };
}

function writeConfig(cwd: string, cfg: ConfigShape): void {
  const full = {
    $schema: "https://localeci.dev/schema.json",
    source: cfg.source,
    targets: cfg.targets,
    provider: { name: "anthropic", apiKeyEnv: "LOCALECI_KEY" },
    quality: { threshold: 85, onBelowThreshold: "flag" },
    glossary: "localeci.glossary.json",
    context: cfg.context ?? { scanCode: false, include: [] },
    style: { tone: "professional", audience: "SaaS product UI", notes: "" },
  };
  writeFileSync(join(cwd, "localeci.config.json"), JSON.stringify(full, null, 2) + "\n", "utf8");

  // Seed an empty glossary if none exists.
  const glossaryPath = join(cwd, "localeci.glossary.json");
  if (!existsSync(glossaryPath)) {
    writeFileSync(
      glossaryPath,
      JSON.stringify({ terms: [{ term: "LocaleCI", translations: {}, note: "never translate" }] }, null, 2) + "\n",
      "utf8",
    );
  }
}
