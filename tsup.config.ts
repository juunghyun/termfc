import { defineConfig } from "tsup";

export default defineConfig({
  entry: { cli: "src/cli/index.ts" },
  format: "esm",
  platform: "node",
  target: "node20",
  // string-width / env-paths (and their deps) are tiny MIT libs — bundle
  // them so nothing needs installing and npx cold-start stays fast. Their
  // copyright notices ship in THIRD_PARTY_NOTICES.md (MIT requirement).
  noExternal: [/.*/],
  banner: {
    js: [
      "#!/usr/bin/env node",
      "/*! termfc — MIT License. Bundles MIT-licensed third-party code;",
      " * copyright notices in THIRD_PARTY_NOTICES.md (shipped in this package). */",
    ].join("\n"),
  },
  clean: true,
  minify: false,
  sourcemap: false,
});
