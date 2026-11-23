import { build } from "esbuild";

const { outputFiles } = await build({
  entryPoints: ["src/collect.ts"],
  bundle: true,
  write: false,
  platform: "browser",
  format: "esm",
  target: "es2022",
  logLevel: "silent",
});
const specifier =
  "data:text/javascript;base64," +
  Buffer.from(outputFiles[0].contents).toString("base64");
const { monitorSources, observe } = await import(specifier);
for (const source of monitorSources) {
  try {
    const observations = await observe(source);
    console.log(
      JSON.stringify({
        source: source.id,
        checkedAt: new Date().toISOString(),
        count: observations.length,
        found: observations.map((row) => ({
          url: row.url,
          published: row.published,
          draft: row.draft,
        })),
      }),
    );
  } catch (err) {
    console.error(
      JSON.stringify({ source: source.id, error: err.message.slice(0, 160) }),
    );
    process.exitCode = 1;
  }
}
