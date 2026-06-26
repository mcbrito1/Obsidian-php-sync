import {
    AuthResponse,
    HttpRequestFn,
    HttpResponse,
    RemoteFile,
} from "./types";

export class SyncError extends Error {
    constructor(
        message: string,
        public readonly status?: number,
    ) {
        super(message);
        this.name = "SyncError";
    }
}

/**
 * Cliente HTTP do backend de sincronizacao.
 *
 * Recebe a funcao de requisicao por injecao (o `requestUrl` do Obsidian em
 * producao, ou um fake nos testes) — por isso nao importa nada de "obsidian".
 */
export class SyncClient {
    /** Callback opcional para re-autenticar quando o token expira (401). */
    private onUnauthorized?: () => Promise<void>;

    constructor(
        private readonly request: HttpRequestFn,
        private serverUrl: string,
        private token: string = "",
        private vaultId: string = "",
    ) {}

    setToken(token: string): void {
        this.token = token;
    }

    /** Define o cofre alvo (enviado no header X-Vault-Id). */
    setVaultId(vaultId: string): void {
        this.vaultId = vaultId;
    }

    /** Headers comuns a todas as requisições (inclui o cofre, se definido). */
    private baseHeaders(): Record<string, string> {
        return this.vaultId ? { "X-Vault-Id": this.vaultId } : {};
    }

    /** Registra um callback chamado uma vez em caso de 401 (deve renovar o token). */
    setOnUnauthorized(callback: () => Promise<void>): void {
        this.onUnauthorized = callback;
    }

    getToken(): string {
        return this.token;
    }

    setServerUrl(serverUrl: string): void {
        this.serverUrl = serverUrl;
    }

    /** Monta a URL final removendo barras duplicadas. */
    private url(path: string): string {
        const base = this.serverUrl.replace(/\/+$/, "");
        const suffix = path.startsWith("/") ? path : `/${path}`;
        return `${base}${suffix}`;
    }

    /** Autentica e armazena o token internamente; retorna o token. */
    async authenticate(username: string, password: string): Promise<string> {
        const response = await this.request({
            url: this.url("/auth"),
            method: "POST",
            headers: { ...this.baseHeaders(), "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }),
            throw: false,
        });

        if (response.status !== 200) {
            throw new SyncError(
                this.messageFrom(response, "Falha na autenticacao."),
                response.status,
            );
        }

        const data = response.json as AuthResponse;
        if (!data || typeof data.token !== "string" || data.token === "") {
            throw new SyncError("Resposta de autenticacao invalida.", response.status);
        }

        this.token = data.token;
        return data.token;
    }

    /** Envia um arquivo (conteudo em base64) para o servidor. */
    async upload(path: string, contentBase64: string): Promise<void> {
        const response = await this.authedRequest({
            url: this.url("/upload"),
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path, content: contentBase64 }),
            throw: false,
        });

        if (response.status !== 200) {
            throw new SyncError(
                this.messageFrom(response, `Falha ao enviar ${path}.`),
                response.status,
            );
        }
    }

    /** Lista os arquivos disponiveis no servidor. */
    async list(): Promise<RemoteFile[]> {
        return this.fetchManifest("/list");
    }

    /** Manifesto (path + hash + mtime) usado para o delta sync. */
    async manifest(): Promise<RemoteFile[]> {
        return this.fetchManifest("/manifest");
    }

    private async fetchManifest(path: string): Promise<RemoteFile[]> {
        const response = await this.authedRequest({
            url: this.url(path),
            method: "GET",
            throw: false,
        });

        if (response.status !== 200) {
            throw new SyncError(
                this.messageFrom(response, "Falha ao obter o manifesto."),
                response.status,
            );
        }

        const data = response.json as { files?: RemoteFile[] };
        return Array.isArray(data?.files) ? data.files : [];
    }

    /** Remove um arquivo no servidor (idempotente). */
    async deleteFile(path: string): Promise<void> {
        const response = await this.authedRequest({
            url: this.url(`/file?path=${encodeURIComponent(path)}`),
            method: "DELETE",
            throw: false,
        });

        if (response.status !== 200) {
            throw new SyncError(
                this.messageFrom(response, `Falha ao remover ${path}.`),
                response.status,
            );
        }
    }

    /** Baixa o conteudo (base64) de um arquivo do servidor. */
    async download(path: string): Promise<string> {
        const response = await this.authedRequest({
            url: this.url(`/download?path=${encodeURIComponent(path)}`),
            method: "GET",
            throw: false,
        });

        if (response.status !== 200) {
            throw new SyncError(
                this.messageFrom(response, `Falha ao baixar ${path}.`),
                response.status,
            );
        }

        const data = response.json as { content?: string };
        if (!data || typeof data.content !== "string") {
            throw new SyncError(`Resposta invalida ao baixar ${path}.`, response.status);
        }

        return data.content;
    }

    private async authedRequest(options: Parameters<HttpRequestFn>[0]): Promise<HttpResponse> {
        if (this.token === "") {
            throw new SyncError("Nao autenticado. Configure e teste a conexao primeiro.");
        }

        const send = () =>
            this.request({
                ...options,
                headers: {
                    ...this.baseHeaders(),
                    ...(options.headers ?? {}),
                    Authorization: `Bearer ${this.token}`,
                },
            });

        let response = await send();

        // Token expirado: re-autentica (uma vez) e repete a requisição.
        if (response.status === 401 && this.onUnauthorized) {
            await this.onUnauthorized();
            if (this.token !== "") {
                response = await send();
            }
        }

        return response;
    }

    /** Extrai uma mensagem de erro amigavel da resposta. */
    private messageFrom(response: HttpResponse, fallback: string): string {
        const data = response.json as { message?: string; error?: string } | null;
        if (data && typeof data.message === "string") {
            return data.message;
        }
        if (data && typeof data.error === "string") {
            return data.error;
        }
        return fallback;
    }
}
