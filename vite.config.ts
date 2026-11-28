import { readdirSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

function pages(): Record<string, string> {
  const input: Record<string, string> = {};
  collectPages(input, root, 0);
  return input;
}

function collectPages(input: Record<string, string>, dir: string, depth: number): void {
  const skipped = new Set(["dist", "node_modules"]);
  for (const name of readdirSync(dir)) {
    if (skipped.has(name) || name.startsWith(".")) continue;
    const full = resolve(dir, name);
    const info = statSync(full);
    if (info.isFile() && name === "index.html") {
      const rel = relative(root, full).replaceAll("\\", "/");
      const key = rel === "index.html" ? "main" : rel.replace(/\/index\.html$/, "");
      input[key] = full;
      continue;
    }
    if (info.isDirectory() && depth < 2) collectPages(input, full, depth + 1);
  }
}

export default defineConfig({
  base: "/secret-santa/",
  build: {
    rollupOptions: {
      input: pages(),
    },
  },
  test: {
    environment: "node",
  },
});
