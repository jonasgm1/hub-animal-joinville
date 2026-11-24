import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { handle } from "../src/app";
import { memoryDb } from "./sqlite";
const { db } = memoryDb();
const origin = "http://127.0.0.1:4319";
const types: Record<string, string> = { woff2: "font/woff2", webp: "image/webp", png: "image/png" };
// Stands in for the Pages static-asset binding: serves the built files from dist/.
const ASSETS = {
  fetch: async (r: Request) => {
    const path = new URL(r.url).pathname;
    try {
      return new Response(await readFile("dist" + path), {
        headers: { "Content-Type": types[path.split(".").pop()!] || "" },
      });
    } catch {
      return new Response(null, { status: 404 });
    }
  },
} as unknown as Fetcher;
createServer(async (req, res) => {
  const buffers = [];
  for await (const c of req) buffers.push(c);
  const body = Buffer.concat(buffers).toString();
  const headers = new Headers();
  for (const [key, val] of Object.entries(req.headers))
    if (typeof val === "string") headers.set(key, val);
  const r = new Request(new URL(req.url || "/", origin), {
    method: req.method,
    headers,
    ...(body ? { body } : {}),
  });
  const response = await handle(r, { DB: db, ASSETS });
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(4319, "127.0.0.1");
