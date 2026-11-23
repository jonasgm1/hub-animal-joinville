import { spawnSync, spawn } from "node:child_process";
for (const [cmd, args] of [
  ["npm", ["run", "build"]],
  [
    "npx",
    ["--no-install", "wrangler", "d1", "migrations", "apply", "DB", "--local"],
  ],
]) {
  const r = spawnSync(cmd, args, { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
const child = spawn(
  "npx",
  [
    "--no-install",
    "wrangler",
    "pages",
    "dev",
    "--ip",
    "0.0.0.0",
    "--port",
    process.env.PORT || "8787",
  ],
  { stdio: "inherit" },
);
process.on("SIGTERM", () => child.kill());
child.on("exit", (code) => process.exit(code ?? 1));
