import { build } from "esbuild";
import { readFile, writeFile, mkdir, readdir, rm } from "node:fs/promises";
const shell = await readFile(".cache/shell/index.html", "utf8");
if (
  !shell.includes("aj-head") ||
  !shell.includes('<div id="aj-content"></div>')
)
  throw Error("Marcadores Astro ausentes");
const assets = {};
for (const file of await readdir(".cache/shell", { recursive: true })) {
  if (!/\.(css|svg)$/.test(file)) continue;
  assets["/" + file] = {
    body: await readFile(".cache/shell/" + file, "utf8"),
    type: file.endsWith(".css")
      ? "text/css"
      : file.endsWith(".svg")
        ? "image/svg+xml"
        : "application/javascript",
  };
}
await mkdir(".cache", { recursive: true });
await writeFile(".cache/assets.json", JSON.stringify({ shell, assets }));
await rm("dist", { recursive: true, force: true });
await build({
  entryPoints: ["src/app.ts"],
  // Cloudflare Pages "advanced mode": dist/_worker.js serves every route.
  outfile: "dist/_worker.js",
  alias: { "aj:assets": "./.cache/assets.json" },
  bundle: true,
  minify: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  conditions: ["worker", "browser"],
});
