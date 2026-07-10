import { defineConfig } from "tsup";

export default defineConfig({
  entry: { cli: "src/cli.ts", index: "src/index.ts" },
  format: ["esm"],
  dts: { entry: "src/index.ts" },
  // `typescript` is optional (AST scanner dynamic-imports it; grep fallback).
  // Keep it external so `npx localeci` stays small and resolves TS from the
  // user's own project when present.
  external: ["typescript"],
  clean: true,
  sourcemap: true,
  target: "node20",
  banner: { js: "#!/usr/bin/env node" },
});
