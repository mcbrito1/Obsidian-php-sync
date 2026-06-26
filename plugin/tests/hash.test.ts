import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { sha256 } from "../src/hash";

describe("sha256", () => {
    it("calcula o mesmo hash que o Node para texto", async () => {
        const buffer = new TextEncoder().encode("conteudo").buffer;
        const expected = createHash("sha256").update("conteudo").digest("hex");
        expect(await sha256(buffer)).toBe(expected);
    });

    it("calcula o hash de dados binários", async () => {
        const bytes = new Uint8Array([0, 1, 2, 255, 128]);
        const expected = createHash("sha256").update(bytes).digest("hex");
        expect(await sha256(bytes.buffer)).toBe(expected);
    });

    it("hash de conteúdo vazio", async () => {
        const expected = createHash("sha256").update("").digest("hex");
        expect(await sha256(new Uint8Array([]).buffer)).toBe(expected);
    });
});
