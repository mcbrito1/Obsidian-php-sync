import { describe, it, expect, vi } from "vitest";
import { SyncClient, SyncError } from "../src/SyncClient";
import { HttpRequestFn, HttpRequestOptions, HttpResponse } from "../src/types";

function jsonResponse(status: number, body: unknown): HttpResponse {
    const text = JSON.stringify(body);
    return {
        status,
        json: body,
        text,
        arrayBuffer: new TextEncoder().encode(text).buffer,
    };
}

/** Cria um fake de HttpRequestFn que retorna respostas pre-programadas por URL. */
function fakeHttp(
    handler: (options: HttpRequestOptions) => HttpResponse,
): { fn: HttpRequestFn; calls: HttpRequestOptions[] } {
    const calls: HttpRequestOptions[] = [];
    const fn: HttpRequestFn = vi.fn(async (options) => {
        calls.push(options);
        return handler(options);
    });
    return { fn, calls };
}

describe("SyncClient.authenticate", () => {
    it("envia credenciais e guarda o token retornado", async () => {
        const { fn, calls } = fakeHttp(() =>
            jsonResponse(200, { token: "abc.def.ghi", token_type: "Bearer", expires_in: 3600 }),
        );
        const client = new SyncClient(fn, "http://localhost:8080");

        const token = await client.authenticate("admin", "s3cret");

        expect(token).toBe("abc.def.ghi");
        expect(client.getToken()).toBe("abc.def.ghi");
        expect(calls[0].url).toBe("http://localhost:8080/auth");
        expect(calls[0].method).toBe("POST");
        expect(JSON.parse(calls[0].body as string)).toEqual({
            username: "admin",
            password: "s3cret",
        });
    });

    it("lanca SyncError com a mensagem do servidor em credenciais invalidas", async () => {
        const { fn } = fakeHttp(() =>
            jsonResponse(401, { error: "invalid_credentials", message: "Usuario ou senha invalidos." }),
        );
        const client = new SyncClient(fn, "http://localhost:8080");

        await expect(client.authenticate("admin", "errada")).rejects.toMatchObject({
            name: "SyncError",
            status: 401,
            message: "Usuario ou senha invalidos.",
        });
    });

    it("normaliza barras finais na URL base", async () => {
        const { fn, calls } = fakeHttp(() => jsonResponse(200, { token: "t" }));
        const client = new SyncClient(fn, "http://localhost:8080///");

        await client.authenticate("a", "b");

        expect(calls[0].url).toBe("http://localhost:8080/auth");
    });
});

describe("SyncClient rotas protegidas", () => {
    it("inclui o header Authorization Bearer", async () => {
        const { fn, calls } = fakeHttp(() => jsonResponse(200, { files: [] }));
        const client = new SyncClient(fn, "http://localhost:8080", "meu-token");

        await client.list();

        expect(calls[0].headers?.Authorization).toBe("Bearer meu-token");
    });

    it("inclui o header X-Vault-Id quando definido", async () => {
        const { fn, calls } = fakeHttp(() => jsonResponse(200, { files: [] }));
        const client = new SyncClient(fn, "http://localhost:8080", "t", "alice");

        await client.list();

        expect(calls[0].headers?.["X-Vault-Id"]).toBe("alice");
    });

    it("omite X-Vault-Id quando vazio", async () => {
        const { fn, calls } = fakeHttp(() => jsonResponse(200, { files: [] }));
        const client = new SyncClient(fn, "http://localhost:8080", "t");

        await client.list();

        expect(calls[0].headers?.["X-Vault-Id"]).toBeUndefined();
    });

    it("lanca se nao houver token", async () => {
        const { fn } = fakeHttp(() => jsonResponse(200, {}));
        const client = new SyncClient(fn, "http://localhost:8080");

        await expect(client.list()).rejects.toBeInstanceOf(SyncError);
    });

    it("upload envia path e content em JSON", async () => {
        const { fn, calls } = fakeHttp(() => jsonResponse(200, { status: "ok" }));
        const client = new SyncClient(fn, "http://localhost:8080", "t");

        await client.upload("Notas/foo.md", "Zm9v");

        expect(calls[0].url).toBe("http://localhost:8080/upload");
        expect(JSON.parse(calls[0].body as string)).toEqual({
            path: "Notas/foo.md",
            content: "Zm9v",
        });
    });

    it("uploadBatch envia todos os arquivos em uma requisição", async () => {
        const { fn, calls } = fakeHttp(() => jsonResponse(200, { status: "ok", files: [] }));
        const client = new SyncClient(fn, "http://localhost:8080", "t");

        await client.uploadBatch([
            { path: "a.md", content: "QQ==" },
            { path: "b.md", content: "Qg==" },
        ]);

        expect(calls).toHaveLength(1);
        expect(calls[0].url).toBe("http://localhost:8080/upload-batch");
        expect(JSON.parse(calls[0].body as string).files).toHaveLength(2);
    });

    it("uploadBatch não faz requisição para lista vazia", async () => {
        const { fn, calls } = fakeHttp(() => jsonResponse(200, {}));
        const client = new SyncClient(fn, "http://localhost:8080", "t");

        await client.uploadBatch([]);

        expect(calls).toHaveLength(0);
    });

    it("upload propaga erro do servidor", async () => {
        const { fn } = fakeHttp(() =>
            jsonResponse(422, { error: "invalid_path", message: "Travessia nao permitida." }),
        );
        const client = new SyncClient(fn, "http://localhost:8080", "t");

        await expect(client.upload("../x", "Zm9v")).rejects.toMatchObject({
            status: 422,
            message: "Travessia nao permitida.",
        });
    });

    it("list retorna o array de arquivos", async () => {
        const { fn } = fakeHttp(() =>
            jsonResponse(200, { files: [{ path: "a.md", hash: "h", size: 2, mtime: 5 }] }),
        );
        const client = new SyncClient(fn, "http://localhost:8080", "t");

        const files = await client.list();

        expect(files).toEqual([{ path: "a.md", hash: "h", size: 2, mtime: 5 }]);
    });

    it("manifest busca /manifest e retorna os arquivos com hash", async () => {
        const { fn, calls } = fakeHttp(() =>
            jsonResponse(200, { files: [{ path: "a.md", hash: "abc", size: 1, mtime: 0 }] }),
        );
        const client = new SyncClient(fn, "http://localhost:8080", "t");

        const files = await client.manifest();

        expect(calls[0].url).toBe("http://localhost:8080/manifest");
        expect(files[0].hash).toBe("abc");
    });

    it("deleteFile faz DELETE em /file com o path escapado", async () => {
        const { fn, calls } = fakeHttp(() => jsonResponse(200, { status: "ok", deleted: true }));
        const client = new SyncClient(fn, "http://localhost:8080", "t");

        await client.deleteFile("Notas/foo.md");

        expect(calls[0].method).toBe("DELETE");
        expect(calls[0].url).toBe("http://localhost:8080/file?path=Notas%2Ffoo.md");
    });

    it("deleteFile propaga erro do servidor", async () => {
        const { fn } = fakeHttp(() =>
            jsonResponse(422, { error: "invalid_path", message: "Travessia nao permitida." }),
        );
        const client = new SyncClient(fn, "http://localhost:8080", "t");

        await expect(client.deleteFile("../x")).rejects.toMatchObject({ status: 422 });
    });

    it("download faz escape do path na query e retorna o conteudo", async () => {
        const { fn, calls } = fakeHttp(() => jsonResponse(200, { content: "Zm9v" }));
        const client = new SyncClient(fn, "http://localhost:8080", "t");

        const content = await client.download("Notas/com espaco.md");

        expect(content).toBe("Zm9v");
        expect(calls[0].url).toBe(
            "http://localhost:8080/download?path=Notas%2Fcom%20espaco.md",
        );
    });

    it("re-autentica e repete a requisição uma vez em caso de 401", async () => {
        let firstCall = true;
        const { fn, calls } = fakeHttp(() => {
            if (firstCall) {
                firstCall = false;
                return jsonResponse(401, { error: "unauthorized" });
            }
            return jsonResponse(200, { files: [] });
        });
        const client = new SyncClient(fn, "http://localhost:8080", "expirado");
        client.setOnUnauthorized(async () => {
            client.setToken("renovado");
        });

        const files = await client.list();

        expect(files).toEqual([]);
        expect(calls).toHaveLength(2);
        expect(calls[0].headers?.Authorization).toBe("Bearer expirado");
        expect(calls[1].headers?.Authorization).toBe("Bearer renovado");
    });

    it("não entra em loop se a re-autenticação não renova o token", async () => {
        const { fn, calls } = fakeHttp(() => jsonResponse(401, { error: "unauthorized" }));
        const client = new SyncClient(fn, "http://localhost:8080", "t");
        client.setOnUnauthorized(async () => {
            /* não renova */
        });

        await expect(client.list()).rejects.toMatchObject({ status: 401 });
        // 1ª chamada + 1 retry (token continuou) — sem loop infinito.
        expect(calls.length).toBeLessThanOrEqual(2);
    });

    it("download lanca 404 quando o arquivo nao existe", async () => {
        const { fn } = fakeHttp(() =>
            jsonResponse(404, { error: "not_found", message: "Arquivo nao encontrado: x.md" }),
        );
        const client = new SyncClient(fn, "http://localhost:8080", "t");

        await expect(client.download("x.md")).rejects.toMatchObject({ status: 404 });
    });
});
