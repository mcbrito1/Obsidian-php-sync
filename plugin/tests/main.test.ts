import { describe, it, expect, vi } from "vitest";
import { createHash } from "node:crypto";
// Importa o fonte explicitamente para não resolver para o bundle main.js gerado pelo build.
import PhpSyncPlugin from "../main.ts";
import { SyncClient } from "../src/SyncClient";
import { HttpRequestFn } from "../src/types";
import { TFile } from "./__mocks__/obsidian";

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const enc = (s: string) => new TextEncoder().encode(s);

/** Servidor REST em memória que implementa os endpoints do backend. */
function inMemoryServer(initial: Record<string, string> = {}): {
    fn: HttpRequestFn;
    store: Map<string, Uint8Array>;
    calls: string[];
} {
    const store = new Map<string, Uint8Array>();
    const calls: string[] = [];
    for (const [p, c] of Object.entries(initial)) store.set(p, enc(c));

    const json = (status: number, body: unknown) => ({
        status,
        json: body,
        text: JSON.stringify(body),
        arrayBuffer: enc(JSON.stringify(body)).buffer,
    });

    const fn: HttpRequestFn = async (opts) => {
        const u = new URL(opts.url);
        const path = u.pathname;
        const query = u.searchParams.get("path") ?? "";
        calls.push(`${opts.method ?? "GET"} ${path}`);

        if (path === "/manifest" || path === "/list") {
            const files = [...store.entries()].map(([p, data]) => ({
                path: p,
                hash: sha(data),
                size: data.length,
                mtime: 0,
            }));
            return json(200, { files });
        }
        if (path === "/upload" && opts.method === "POST") {
            const body = JSON.parse(opts.body as string);
            store.set(body.path, new Uint8Array(Buffer.from(body.content, "base64")));
            return json(200, { status: "ok" });
        }
        if (path === "/upload-batch" && opts.method === "POST") {
            const body = JSON.parse(opts.body as string) as {
                files: { path: string; content: string }[];
            };
            for (const f of body.files) {
                store.set(f.path, new Uint8Array(Buffer.from(f.content, "base64")));
            }
            return json(200, { status: "ok", files: body.files.map((f) => ({ path: f.path })) });
        }
        if (path === "/download") {
            const data = store.get(query);
            if (!data) return json(404, { error: "not_found" });
            return json(200, { content: Buffer.from(data).toString("base64") });
        }
        if (path === "/file" && opts.method === "DELETE") {
            const existed = store.delete(query);
            return json(200, { status: "ok", deleted: existed });
        }
        return json(404, { error: "unknown" });
    };

    return { fn, store, calls };
}

/** Cofre local em memória que implementa o subconjunto usado de `vault`. */
function fakeVault(initial: Record<string, string> = {}) {
    const files = new Map<string, { data: Uint8Array; mtime: number }>();
    for (const [p, c] of Object.entries(initial)) files.set(p, { data: enc(c), mtime: 0 });

    const toTFile = (path: string): TFile => {
        const entry = files.get(path);
        const f = new TFile();
        f.path = path;
        f.stat = { mtime: entry?.mtime ?? 0, ctime: 0, size: entry?.data.length ?? 0 };
        return f;
    };

    return {
        files,
        getFiles: () => [...files.keys()].map(toTFile),
        readBinary: async (file: TFile) => files.get(file.path)!.data.buffer,
        getAbstractFileByPath: (path: string) =>
            files.has(path) ? toTFile(path) : null,
        createBinary: async (path: string, data: ArrayBuffer) => {
            files.set(path, { data: new Uint8Array(data), mtime: 0 });
        },
        modifyBinary: async (file: TFile, data: ArrayBuffer) => {
            files.set(file.path, { data: new Uint8Array(data), mtime: 0 });
        },
        createFolder: async () => {},
    };
}

function makePlugin(
    server: ReturnType<typeof inMemoryServer>,
    vault: ReturnType<typeof fakeVault>,
    lastSync: Record<string, { hash: string; mtime: number }> = {},
) {
    const trashFile = vi.fn(async (file: TFile) => {
        vault.files.delete(file.path);
    });
    const app = { vault, fileManager: { trashFile } };

    const plugin = new PhpSyncPlugin(app, {});
    plugin.settings = {
        serverUrl: "http://server",
        username: "admin",
        password: "pw",
        token: "tkn",
        vaultId: "",
        syncOnStartup: false,
        syncOnChange: false,
        syncIntervalMinutes: 0,
        excludePatterns: "",
        includePatterns: "",
        lastSync,
        hashCache: {},
    };
    plugin.client = new SyncClient(server.fn, "http://server", "tkn");
    plugin.saveData = vi.fn(async () => {});

    return { plugin, trashFile };
}

describe("runSync (orquestração end-to-end em memória)", () => {
    it("envia arquivos locais novos para o servidor", async () => {
        const server = inMemoryServer();
        const vault = fakeVault({ "a.md": "conteudo A" });
        const { plugin } = makePlugin(server, vault);

        await plugin.runSync();

        expect(server.store.has("a.md")).toBe(true);
        expect(Buffer.from(server.store.get("a.md")!).toString()).toBe("conteudo A");
        expect(plugin.settings.lastSync["a.md"].hash).toBe(sha(enc("conteudo A")));
    });

    it("baixa arquivos novos do servidor para o cofre", async () => {
        const server = inMemoryServer({ "b.md": "remoto B" });
        const vault = fakeVault();
        const { plugin } = makePlugin(server, vault);

        await plugin.runSync();

        expect(vault.files.has("b.md")).toBe(true);
        expect(Buffer.from(vault.files.get("b.md")!.data).toString()).toBe("remoto B");
    });

    it("propaga exclusão remota apagando o arquivo local", async () => {
        // Estava sincronizado; sumiu do servidor e não mudou localmente.
        const content = "sync";
        const server = inMemoryServer();
        const vault = fakeVault({ "c.md": content });
        const { plugin, trashFile } = makePlugin(server, vault, {
            "c.md": { hash: sha(enc(content)), mtime: 0 },
        });

        await plugin.runSync();

        expect(trashFile).toHaveBeenCalledOnce();
        expect(vault.files.has("c.md")).toBe(false);
        expect(plugin.settings.lastSync["c.md"]).toBeUndefined();
    });

    it("propaga exclusão local apagando no servidor", async () => {
        const content = "sync";
        const server = inMemoryServer({ "d.md": content });
        const vault = fakeVault();
        const { plugin } = makePlugin(server, vault, {
            "d.md": { hash: sha(enc(content)), mtime: 0 },
        });

        await plugin.runSync();

        expect(server.store.has("d.md")).toBe(false);
    });

    it("não re-hasha arquivos inalterados no segundo sync (cache de hash)", async () => {
        const server = inMemoryServer();
        const vault = fakeVault({ "a.md": "estável" });
        const { plugin } = makePlugin(server, vault);
        const spy = vi.spyOn(vault, "readBinary");

        await plugin.runSync();
        expect(plugin.settings.hashCache["a.md"]).toBeDefined();
        expect(spy.mock.calls.length).toBeGreaterThan(0);

        // Nada mudou localmente nem no servidor → segundo sync não lê o arquivo.
        spy.mockClear();
        await plugin.runSync();
        expect(spy).not.toHaveBeenCalled();
    });

    it("usa /upload-batch para enviar (em lote)", async () => {
        const server = inMemoryServer();
        const vault = fakeVault({ "a.md": "A", "b.md": "B" });
        const { plugin } = makePlugin(server, vault);

        await plugin.runSync();

        // Ambos os arquivos chegaram via uma única chamada batch (sem /upload single).
        expect(server.store.has("a.md")).toBe(true);
        expect(server.store.has("b.md")).toBe(true);
        expect(server.calls).toContain("POST /upload-batch");
        expect(server.calls).not.toContain("POST /upload");
    });
});
