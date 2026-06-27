import { describe, it, expect } from "vitest";
import { textToBase64, base64ToText, isProbablyTextBase64 } from "./base64";

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

describe("isProbablyTextBase64", () => {
    it("considera texto UTF-8 como texto", () => {
        expect(isProbablyTextBase64(textToBase64("# Olá ção"))).toBe(true);
    });

    it("considera conteúdo com byte nulo como binário", () => {
        const withNull = btoa(String.fromCharCode(80, 0, 75)); // "P\0K" (assinatura tipo zip)
        expect(isProbablyTextBase64(withNull)).toBe(false);
    });

    it("considera bytes UTF-8 inválidos como binário", () => {
        const invalid = btoa(String.fromCharCode(0xff, 0xfe, 0xfd));
        expect(isProbablyTextBase64(invalid)).toBe(false);
    });
});
