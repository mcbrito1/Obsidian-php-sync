import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
    resolve: {
        alias: {
            // Resolve `import ... from "obsidian"` para o mock nos testes.
            obsidian: fileURLToPath(new URL("./tests/__mocks__/obsidian.ts", import.meta.url)),
        },
    },
    test: {
        include: ["tests/**/*.test.ts"],
        environment: "node",
    },
});
