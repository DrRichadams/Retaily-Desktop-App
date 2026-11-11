import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: resolve(rootDir, "src/main/index.ts"),
      },
    },
  },

  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: resolve(rootDir, "src/preload/index.ts"),
        output: {
          format: "cjs",
          entryFileNames: "[name].cjs",
        },
      },
    },
  },

  renderer: {
    root: resolve(rootDir, "src/renderer"),

    plugins: [react()],

    resolve: {
      alias: {
        "@": resolve(rootDir, "src/renderer/src"),
      },
    },
  },
});
