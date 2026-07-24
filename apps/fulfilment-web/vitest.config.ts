import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    exclude: ["**/node_modules/**", "**/e2e/**"],
    // @faira/ui resolves (via the alias below) to a source path OUTSIDE this
    // app, which vitest would treat as an external and hand to Node as-is —
    // its `import { useId } from "react"` then resolves a second React whose
    // hook dispatcher is null ("Cannot read properties of null (reading
    // 'useId')"). Inlining forces the package source through Vite's pipeline
    // with the app's single, deduped React.
    server: { deps: { inline: [/packages[\\/]ui[\\/]/] } },
  },
  resolve: {
    // One React instance across the app and the inlined @faira/ui source, so
    // component hooks find a live dispatcher.
    dedupe: ["react", "react-dom"],
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Transform @faira/ui SOURCE so component tests (and their per-test
      // mocks) run against the real TSX, matching how Next transpiles it.
      "@faira/ui": path.resolve(__dirname, "../../packages/ui/src/index.ts"),
    },
  },
});
