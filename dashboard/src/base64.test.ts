import { describe, it, expect } from "vitest";
import { textToBase64, base64ToText } from "./base64";

describe("base64", () => {
    it("faz round-trip de texto com acentos", () => {
        const original = "Sincronização — ção ✔ café";
        expect(base64ToText(textToBase64(original))).toBe(original);
    });

    it("vetores conhecidos", () => {
        expect(textToBase64("foo")).toBe("Zm9v");
        expect(base64ToText("Zm9vYmFy")).toBe("foobar");
    });

    it("string vazia", () => {
        expect(textToBase64("")).toBe("");
        expect(base64ToText("")).toBe("");
    });
});
