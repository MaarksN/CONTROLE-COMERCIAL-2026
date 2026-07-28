import { defineConfig } from "vitest/config";

// Deliberately separate from vite.config.ts: that config wires up the
// Cloudflare Workers plugin for the actual app build/dev server, which is
// incompatible with Vitest's node test environment. The derive* modules
// under test are plain TypeScript with no Cloudflare/React runtime
// dependency, so they don't need that pipeline at all.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
