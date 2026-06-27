import { describe, it, expect } from "vitest";
import {
    arrayBufferToBase64,
    base64ToArrayBuffer,
    textToBase64,
    base64ToText,
} from "../src/base64";

describe("base64", () => {
    it("faz round-trip de texto UTF-8 com acentos", () => {
        const original = "Olá, mundo! Sincronização ção ✔";
        expect(base64ToText(textToBase64(original))).toBe(original);
    });

    it("faz round-trip de dados binarios arbitrarios", () => {
        const bytes = new Uint8Array([0, 1, 2, 254, 255, 128, 127, 42]);
        const b64 = arrayBufferToBase64(bytes.buffer);
        const back = new Uint8Array(base64ToArrayBuffer(b64));
        expect(Array.from(back)).toEqual(Array.from(bytes));
    });

    it("codifica como o esperado (vetores conhecidos)", () => {
        expect(textToBase64("")).toBe("");
        expect(textToBase64("f")).toBe("Zg==");
        expect(textToBase64("fo")).toBe("Zm8=");
        expect(textToBase64("foo")).toBe("Zm9v");
        expect(textToBase64("foob")).toBe("Zm9vYg==");
    });

    it("decodifica vetores conhecidos", () => {
        expect(base64ToText("Zm9vYmFy")).toBe("foobar");
    });

    it("lida com buffer vazio", () => {
        expect(arrayBufferToBase64(new Uint8Array([]).buffer)).toBe("");
        expect(new Uint8Array(base64ToArrayBuffer("")).length).toBe(0);
    });
});
