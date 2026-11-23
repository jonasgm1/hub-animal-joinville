import { build } from "esbuild";
await build({
  entryPoints: ["tests/browser-server.ts"],
  outfile: ".cache/test-server.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  alias: { "aj:assets": "./.cache/assets.json" },
});
await import("../.cache/test-server.mjs");
