import { describe, it, expect } from "vitest";
import { planSync, buildLastSync, FileMeta } from "../src/syncPlan";
import { SyncStateEntry } from "../src/types";

const f = (path: string, hash: string, mtime = 0): FileMeta => ({ path, hash, mtime });
const state = (entries: Record<string, string>): Record<string, SyncStateEntry> =>
    Object.fromEntries(Object.entries(entries).map(([p, h]) => [p, { hash: h, mtime: 0 }]));

describe("planSync — novos arquivos", () => {
    it("envia arquivo novo só local", () => {
        const plan = planSync([f("a.md", "h1")], [], {});
        expect(plan.toUpload).toEqual(["a.md"]);
        expect(plan.toDownload).toEqual([]);
        expect(plan.toDeleteLocal).toEqual([]);
        expect(plan.toDeleteRemote).toEqual([]);
    });

    it("baixa arquivo novo só remoto", () => {
        const plan = planSync([], [f("a.md", "h1")], {});
        expect(plan.toDownload).toEqual(["a.md"]);
    });

    it("não faz nada se hashes são iguais", () => {
        const plan = planSync([f("a.md", "h1")], [f("a.md", "h1")], {});
        expect(plan).toEqual({
            toUpload: [],
            toDownload: [],
            toDeleteLocal: [],
            toDeleteRemote: [],
        });
    });
});

describe("planSync — exclusões", () => {
    it("propaga exclusão remota apagando localmente", () => {
        // Estava sincronizado; sumiu do servidor e local não mudou.
        const plan = planSync([f("a.md", "h1")], [], state({ "a.md": "h1" }));
        expect(plan.toDeleteLocal).toEqual(["a.md"]);
        expect(plan.toUpload).toEqual([]);
    });

    it("propaga exclusão local apagando no servidor", () => {
        const plan = planSync([], [f("a.md", "h1")], state({ "a.md": "h1" }));
        expect(plan.toDeleteRemote).toEqual(["a.md"]);
        expect(plan.toDownload).toEqual([]);
    });

    it("re-envia (não apaga) se o arquivo local mudou após sumir do servidor", () => {
        // Sumiu do servidor, mas local foi editado desde o último sync → mantém local.
        const plan = planSync([f("a.md", "h2")], [], state({ "a.md": "h1" }));
        expect(plan.toUpload).toEqual(["a.md"]);
        expect(plan.toDeleteLocal).toEqual([]);
    });
});

describe("planSync — modificações e conflitos", () => {
    it("envia quando só o local mudou", () => {
        const plan = planSync(
            [f("a.md", "novo")],
            [f("a.md", "base")],
            state({ "a.md": "base" }),
        );
        expect(plan.toUpload).toEqual(["a.md"]);
    });

    it("baixa quando só o remoto mudou", () => {
        const plan = planSync(
            [f("a.md", "base")],
            [f("a.md", "novo")],
            state({ "a.md": "base" }),
        );
        expect(plan.toDownload).toEqual(["a.md"]);
    });

    it("conflito: mtime maior vence (local mais novo → upload)", () => {
        const plan = planSync(
            [f("a.md", "localH", 200)],
            [f("a.md", "remoteH", 100)],
            state({ "a.md": "base" }),
        );
        expect(plan.toUpload).toEqual(["a.md"]);
        expect(plan.toDownload).toEqual([]);
    });

    it("conflito: mtime maior vence (remoto mais novo → download)", () => {
        const plan = planSync(
            [f("a.md", "localH", 100)],
            [f("a.md", "remoteH", 200)],
            state({ "a.md": "base" }),
        );
        expect(plan.toDownload).toEqual(["a.md"]);
        expect(plan.toUpload).toEqual([]);
    });
});

describe("buildLastSync", () => {
    it("reflete o conteúdo local para arquivos enviados/inalterados", () => {
        const local = [f("a.md", "h1", 5)];
        const plan = planSync(local, [], {});
        const next = buildLastSync(local, [], plan);
        expect(next).toEqual({ "a.md": { hash: "h1", mtime: 5 } });
    });

    it("reflete o conteúdo remoto para arquivos baixados", () => {
        const remote = [f("a.md", "rh", 9)];
        const plan = planSync([], remote, {});
        const next = buildLastSync([], remote, plan);
        expect(next).toEqual({ "a.md": { hash: "rh", mtime: 9 } });
    });

    it("omite arquivos removidos dos dois lados", () => {
        const local = [f("a.md", "h1")];
        const plan = planSync(local, [], state({ "a.md": "h1" })); // deleteLocal
        const next = buildLastSync(local, [], plan);
        expect(next).toEqual({});
    });
});
