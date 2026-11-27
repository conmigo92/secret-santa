import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "/secret-santa/",
  test: {
    environment: "node",
  },
});
