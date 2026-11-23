import { createServer } from "node:http";
import { handle } from "../src/app";
import { memoryDb } from "./sqlite";
const { db } = memoryDb();
const origin = "http://127.0.0.1:4319";
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
  const response = await handle(r, { DB: db });
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(await response.text());
}).listen(4319, "127.0.0.1");
