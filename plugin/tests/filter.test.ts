import { describe, it, expect } from "vitest";
import { parsePatterns, matchGlob, shouldSync } from "../src/filter";

describe("parsePatterns", () => {
    it("quebra por linhas e vírgulas, ignorando vazios", () => {
        expect(parsePatterns(".obsidian/\n\n*.tmp, secret.md")).toEqual([
            ".obsidian/",
            "*.tmp",
            "secret.md",
        ]);
    });
});

describe("matchGlob", () => {
    it("diretório com barra final casa tudo abaixo", () => {
        expect(matchGlob(".obsidian/app.json", ".obsidian/")).toBe(true);
        expect(matchGlob(".obsidian/plugins/x/main.js", ".obsidian/")).toBe(true);
        expect(matchGlob("nota.md", ".obsidian/")).toBe(false);
    });

    it("* não cruza barras, ** cruza", () => {
        expect(matchGlob("a.tmp", "*.tmp")).toBe(true);
        expect(matchGlob("sub/a.tmp", "*.tmp")).toBe(false);
        expect(matchGlob("sub/a.tmp", "**/*.tmp")).toBe(true);
        expect(matchGlob("a.tmp", "**/*.tmp")).toBe(true);
    });

    it("casa nome exato", () => {
        expect(matchGlob("secret.md", "secret.md")).toBe(true);
        expect(matchGlob("outro.md", "secret.md")).toBe(false);
    });
});

describe("shouldSync", () => {
    it("exclui por padrão de diretório", () => {
        expect(shouldSync(".obsidian/app.json", [".obsidian/"])).toBe(false);
        expect(shouldSync("Notas/a.md", [".obsidian/"])).toBe(true);
    });

    it("com inclusão, só passa o que casa a inclusão", () => {
        expect(shouldSync("a.md", [], ["**/*.md"])).toBe(true);
        expect(shouldSync("a.png", [], ["**/*.md"])).toBe(false);
    });

    it("exclusão tem precedência sobre inclusão", () => {
        expect(shouldSync("secret.md", ["secret.md"], ["**/*.md"])).toBe(false);
    });
});
