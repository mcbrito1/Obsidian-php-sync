import { describe, it, expect } from "vitest";
import { planSync } from "../src/syncPlan";
import { RemoteFile } from "../src/types";

const remote = (path: string): RemoteFile => ({ path, size: 1, mtime: 0 });

describe("planSync", () => {
    it("envia todos os arquivos locais (ordenados)", () => {
        const plan = planSync(["b.md", "a.md"], []);
        expect(plan.toUpload).toEqual(["a.md", "b.md"]);
        expect(plan.toDownload).toEqual([]);
    });

    it("baixa arquivos remotos que nao existem localmente", () => {
        const plan = planSync(["local.md"], [remote("local.md"), remote("remoto.md")]);
        expect(plan.toDownload).toEqual(["remoto.md"]);
    });

    it("nao baixa arquivos que ja existem localmente", () => {
        const plan = planSync(["nota.md"], [remote("nota.md")]);
        expect(plan.toDownload).toEqual([]);
    });

    it("lida com cofre local vazio", () => {
        const plan = planSync([], [remote("a.md"), remote("b.md")]);
        expect(plan.toUpload).toEqual([]);
        expect(plan.toDownload).toEqual(["a.md", "b.md"]);
    });
});
