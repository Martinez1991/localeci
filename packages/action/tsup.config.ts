import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts" },
  // A GitHub Action runs without node_modules → bundle everything (noExternal).
  // ESM keeps import.meta.url valid; `shims: true` injects a createRequire-based
  // `require` so CJS deps (@actions/core) that call require('os') at runtime work.
  format: ["esm"],
  noExternal: [/.*/],
  clean: true,
  sourcemap: false,
  target: "node20",
  dts: false,
  // Define a real `require` at the top of the ESM bundle so esbuild's __require
  // shim delegates to it (needed by CJS deps like @actions/core that call
  // require('os') at runtime).
  banner: {
    js: "import { createRequire as __lcCreateRequire } from 'module';\nconst require = __lcCreateRequire(import.meta.url);",
  },
});
