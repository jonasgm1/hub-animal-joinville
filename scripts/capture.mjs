// Captures one page at a given CSS viewport: node scripts/capture.mjs <url> <out.png> <width> <height> [fullPage]
import { chromium } from "@playwright/test";
const [url, out, w, h, full] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
await p.goto(url, { waitUntil: "networkidle" });
await p.evaluate(() => document.fonts.ready);
await p.screenshot({ path: out, fullPage: !!full });
await b.close();
