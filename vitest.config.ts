/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "src/test/mocks");

// Dedicated Vitest config — separate from vite.config.ts to avoid the
// async Tauri/Vite server config causing Vitest to hang on startup.
export default defineConfig({
    plugins: [react()],
    // resolve.alias is applied by vite:import-analysis BEFORE tests run,
    // which is why Tauri mocks MUST live here, not under test.alias.
    resolve: {
        alias: {
            "@tauri-apps/api/core": resolve(root, "tauri.ts"),
            "@tauri-apps/api/event": resolve(root, "tauriEvent.ts"),
            "@tauri-apps/api/window": resolve(root, "tauriWindow.ts"),
            "@tauri-apps/plugin-dialog": resolve(root, "tauriDialog.ts"),
            "@tauri-apps/plugin-opener": resolve(root, "tauriOpener.ts"),
        },
    },
    test: {
        globals: true,
        environment: "jsdom",
        setupFiles: "./src/test/setup.ts",
        include: ["src/**/*.{test,spec}.{ts,tsx}"],
        exclude: ["node_modules", "**/src-tauri/**"],
        css: true,
    },
});

