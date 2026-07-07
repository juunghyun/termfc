import { defineConfig } from "tsup";

export default defineConfig({
  entry: { cli: "src/cli/index.ts" },
  format: "esm",
  platform: "node",
  target: "node20",
  // string-width / env-paths are tiny MIT libs — bundle them so the published
  // package has zero runtime dependencies and npx cold-start stays fast.
  noExternal: [/.*/],
  banner: { js: "#!/usr/bin/env node" },
  clean: true,
  minify: false,
  sourcemap: false,
});
