import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwind from "@tailwindcss/vite";
export default defineConfig({
  build: { inlineStylesheets: "never" },
  outDir: "./.cache/shell",
  integrations: [react()],
  vite: { plugins: [tailwind()] },
});
