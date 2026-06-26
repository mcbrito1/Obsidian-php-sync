import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
    ApiError,
    login,
    fetchManifest,
    downloadText,
    uploadText,
    fetchVersions,
    UNAUTHORIZED_EVENT,
} from "./api";
import { getToken, setToken } from "./auth";
import { textToBase64 } from "./base64";

function jsonResponse(status: number, data: unknown) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => data,
    } as Response;
}

const fetchMock = vi.fn();

beforeEach(() => {
    localStorage.clear();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("login", () => {
    it("envia credenciais e guarda o token", async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(200, { token: "jwt-123" }));

        const token = await login("admin", "s3cret");

        expect(token).toBe("jwt-123");
        expect(getToken()).toBe("jwt-123");

        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe("/api/auth");
        expect(init.method).toBe("POST");
        expect(JSON.parse(init.body)).toEqual({ username: "admin", password: "s3cret" });
        expect(init.headers.Authorization).toBeUndefined();
    });

    it("lança ApiError com a mensagem do servidor", async () => {
        fetchMock.mockResolvedValueOnce(
            jsonResponse(401, { error: "invalid_credentials", message: "Usuário ou senha inválidos." }),
        );

        await expect(login("admin", "x")).rejects.toMatchObject({
            name: "ApiError",
            status: 401,
            message: "Usuário ou senha inválidos.",
        });
    });
});

describe("rotas autenticadas", () => {
    beforeEach(() => setToken("tkn"));

    it("fetchManifest envia Authorization e X-Vault-Id", async () => {
        fetchMock.mockResolvedValueOnce(
            jsonResponse(200, { files: [{ path: "a.md", hash: "h", size: 1, mtime: 0 }] }),
        );

        const files = await fetchManifest("alice");

        expect(files).toHaveLength(1);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe("/api/manifest");
        expect(init.headers.Authorization).toBe("Bearer tkn");
        expect(init.headers["X-Vault-Id"]).toBe("alice");
    });

    it("uploadText envia o conteúdo em base64", async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(200, { status: "ok" }));

        await uploadText("nota.md", "olá", "default");

        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe("/api/upload");
        expect(JSON.parse(init.body)).toEqual({ path: "nota.md", content: textToBase64("olá") });
    });

    it("downloadText decodifica o base64 retornado", async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(200, { content: textToBase64("conteúdo") }));

        await expect(downloadText("nota.md", "default")).resolves.toBe("conteúdo");
        expect(fetchMock.mock.calls[0][0]).toBe("/api/download?path=nota.md");
    });

    it("fetchVersions monta a query com o path", async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(200, { versions: [{ id: "1.2", size: 3, mtime: 9 }] }));

        const versions = await fetchVersions("Notas/a.md", "default");

        expect(versions[0].id).toBe("1.2");
        expect(fetchMock.mock.calls[0][0]).toBe("/api/versions?path=Notas%2Fa.md");
    });

    it("propaga erro 404 como ApiError", async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(404, { error: "not_found", message: "nao existe" }));

        await expect(downloadText("x.md", "default")).rejects.toBeInstanceOf(ApiError);
    });

    it("em 401 limpa o token e emite o evento de logout", async () => {
        const onUnauthorized = vi.fn();
        window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
        fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: "unauthorized" }));

        await expect(fetchManifest("default")).rejects.toMatchObject({ status: 401 });

        expect(getToken()).toBe("");
        expect(onUnauthorized).toHaveBeenCalledOnce();
        window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    });
});
