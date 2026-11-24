import { chromium } from "@playwright/test";
const [base, out, ...paths] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
for (const [w, h, tag] of [[390, 844, "mobile"], [1440, 900, "desktop"]]) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  for (const path of paths) {
    await p.goto(base + path, { waitUntil: "networkidle" });
    await p.screenshot({ path: `${out}/${tag}${path.replaceAll("/", "_") || "_home"}.png`, fullPage: true });
  }
}
await b.close();
