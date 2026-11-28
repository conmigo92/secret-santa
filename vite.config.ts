import { existsSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

function pages(): Record<string, string> {
  const input: Record<string, string> = { main: resolve(root, "index.html") };
  for (const name of readdirSync(root)) {
    const index = resolve(root, name, "index.html");
    if (existsSync(index) && statSync(index).isFile()) input[name] = index;
  }
  return input;
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
