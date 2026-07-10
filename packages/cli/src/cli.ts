/** localeci — CLI entrypoint. */
import { parseArgs } from "node:util";
import { cmdInit } from "./commands/init.js";
import { cmdTranslate } from "./commands/translate.js";
import { cmdCheck } from "./commands/check.js";
import { cmdStatus } from "./commands/status.js";
import { cmdDataset } from "./commands/dataset.js";
import { log, c } from "./lib/output.js";
import { ConfigError, type DatasetFormat } from "@localeci/core";

const VERSION = "0.5.0";

const HELP = `${c.bold("localeci")} — ship your app in 30 languages, without leaving Git.

${c.bold("Usage")}
  localeci <command> [options]

${c.bold("Commands")}
  init                 Detect your i18n setup and write localeci.config.json
  translate            Translate missing/changed strings to your target locales
  check                Validate without translating (CI mode; exits non-zero on problems)
  status               Show coverage per locale
  dataset              Export a fine-tuning dataset (JSONL) from approved translations

${c.bold("Options")}
  --to <locales>       Comma-separated subset of target locales (translate/check)
  --mock               Use the deterministic mock provider (no API key)
  --paranoid           translate: back-translate and cross-check each string (2x cost)
  --json               translate/check: machine-readable JSON output
  --no-strict          check: don't fail on missing strings (only on broken/low-score)
  --force              init: overwrite an existing config
  --format <fmt>       dataset: openai | plain (default openai)
  --out <file>         dataset: output path (default localeci.dataset.jsonl)
  --include-auto       dataset: include machine (non-human) translations
  --cwd <dir>          Run in a different directory
  -h, --help           Show this help
  -v, --version        Show version

${c.bold("Examples")}
  npx localeci init
  npx localeci translate --to pt-BR,de
  npx localeci check
`;

function parseLocales(v: string | undefined): string[] | undefined {
  if (!v) return undefined;
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      to: { type: "string" },
      mock: { type: "boolean" },
      paranoid: { type: "boolean" },
      json: { type: "boolean" },
      strict: { type: "boolean", default: true },
      force: { type: "boolean" },
      format: { type: "string" },
      out: { type: "string" },
      "include-auto": { type: "boolean" },
      cwd: { type: "string" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
  });

  if (values.version) {
    log.info(VERSION);
    return 0;
  }
  const command = positionals[0];
  if (values.help || !command) {
    log.info(HELP);
    return command ? 0 : values.help ? 0 : 1;
  }

  const cwd = values.cwd ? values.cwd : process.cwd();
  const to = parseLocales(values.to);

  try {
    switch (command) {
      case "init":
        return await cmdInit({ cwd, force: values.force });
      case "translate":
        return await cmdTranslate({ cwd, ...(to ? { to } : {}), mock: values.mock, paranoid: values.paranoid, json: values.json, today: today(), env: process.env });
      case "check":
        return await cmdCheck({ cwd, ...(to ? { to } : {}), strict: values.strict, json: values.json });
      case "status":
        return await cmdStatus({ cwd });
      case "dataset":
        return await cmdDataset({
          cwd,
          ...(values.format ? { format: values.format as DatasetFormat } : {}),
          ...(values.out ? { out: values.out } : {}),
          includeAuto: values["include-auto"],
        });
      default:
        log.error(`Unknown command: ${command}`);
        log.info(HELP);
        return 1;
    }
  } catch (e) {
    if (e instanceof ConfigError) {
      log.error(e.message);
      return 1;
    }
    log.error((e as Error).message);
    if (process.env.LOCALECI_DEBUG) console.error(e);
    return 1;
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (e) => {
    log.error(String(e));
    process.exit(1);
  },
);
