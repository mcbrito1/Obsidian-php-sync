/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// O dashboard fala apenas com a sua própria origem (/api); o Vite faz proxy
// para o backend, eliminando problemas de CORS no desenvolvimento.
// Em Docker, VITE_PROXY_TARGET=http://backend:8080 (rede do compose).
const proxyTarget = process.env.VITE_PROXY_TARGET ?? "http://localhost:8080";

export default defineConfig({
    plugins: [react()],
    build: {
        rollupOptions: {
            output: {
                manualChunks: {
                    // Separa o CodeMirror (pesado) num chunk próprio.
                    codemirror: [
                        "@codemirror/merge",
                        "@codemirror/state",
                        "@codemirror/view",
                        "@codemirror/lang-markdown",
                    ],
                },
            },
        },
    },
    server: {
        host: true,
        port: 5173,
        proxy: {
            "/api": {
                target: proxyTarget,
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api/, ""),
            },
        },
    },
    test: {
        environment: "jsdom",
        globals: true,
        setupFiles: "./src/setupTests.ts",
        css: false,
    },
});
