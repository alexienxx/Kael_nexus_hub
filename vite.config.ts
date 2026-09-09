import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;

          const normalized = id.replace(/\\/g, "/");
          const marker = "/node_modules/";
          const packagePath = normalized.slice(normalized.lastIndexOf(marker) + marker.length);
          const segments = packagePath.split("/");
          const packageName = packagePath.startsWith("@")
            ? `${segments[0]}-${segments[1]}`
            : segments[0];
          const markdownPackages = [
            "bail", "ccount", "comma-separated-tokens", "decode-named-character-reference",
            "devlop", "hast-util-to-jsx-runtime", "hast-util-whitespace", "html-url-attributes",
            "longest-streak", "markdown-table", "property-information", "react-markdown",
            "remark-gfm", "remark-parse", "remark-rehype", "space-separated-tokens",
            "style-to-js", "style-to-object", "trim-lines", "trough", "unified",
            "unist-util-is", "unist-util-position", "unist-util-stringify-position",
            "unist-util-visit", "unist-util-visit-parents", "vfile", "vfile-message", "zwitch",
          ];

          if (["react", "react-dom", "scheduler"].includes(packageName)) return "vendor-react";
          if (
            packageName === "recharts" ||
            packageName === "recharts-scale" ||
            packageName === "react-smooth" ||
            packageName === "victory-vendor" ||
            packageName === "decimal.js-light" ||
            packageName.startsWith("d3-")
          ) return "vendor-charts";
          if (
            packageName.startsWith("micromark") ||
            packageName.startsWith("mdast-") ||
            markdownPackages.includes(packageName)
          ) return "vendor-markdown";
          if (packageName.startsWith("@capacitor-")) return "vendor-capacitor";

          return "vendor";
        },
      },
    },
  },
}));
