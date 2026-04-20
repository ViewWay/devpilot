import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            // React core
            if (id.includes("/react/") || id.includes("/react-dom/")) {
              return "react-vendor";
            }
            // Radix UI + UI libs
            if (id.includes("@radix-ui") || id.includes("lucide-react") || id.includes("class-variance-authority")) {
              return "ui-vendor";
            }
            // Monaco Editor
            if (id.includes("monaco-editor") || id.includes("@monaco-editor")) {
              return "monaco-editor";
            }
            // xterm
            if (id.includes("@xterm") || id.includes("xterm")) {
              return "xterm-vendor";
            }
            // Shiki core engine (small)
            if (id.includes("@shikijs/core") || id.includes("shiki/wasm") || id.includes("shiki/engine")) {
              return "shiki-engine";
            }
            // Shiki themes (loaded lazily)
            if (id.includes("shiki/themes/")) {
              return undefined; // let rollup create natural chunks
            }
            // Shiki language grammars (loaded lazily per-language)
            if (id.includes("shiki/langs/")) {
              return undefined; // let rollup create natural chunks
            }
            // Shiki runtime glue (index, bundle, etc.)
            if (id.includes("shiki") && !id.includes("shiki-wrapper")) {
              return "shiki-runtime";
            }
            // Marked / Markdown
            if (id.includes("marked") || id.includes("remarkable") || id.includes("unified") || id.includes("rehype") || id.includes("remark")) {
              return "markdown-vendor";
            }
            // Zustand + state
            if (id.includes("zustand") || id.includes("immer")) {
              return "state-vendor";
            }
            // All other node_modules
            return "vendor";
          }
        },
      },
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/__tests__/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "lcov", "json-summary"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/__tests__/**",
        "src/vite-env.d.ts",
        "src/main.tsx",
        "src/**/index.ts",
        "src/i18n/**",
      ],
      thresholds: {
        statements: 60,
        branches: 50,
        functions: 60,
        lines: 60,
      },
    },
    // Fail on unhandled rejections
    onUnhandledRejection: "error",
    // Retry flaky tests
    retry: 1,
  },
});
