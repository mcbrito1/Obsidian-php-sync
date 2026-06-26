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
    constructor(
        private readonly request: HttpRequestFn,
        private serverUrl: string,
        private token: string = "",
    ) {}

    setToken(token: string): void {
        this.token = token;
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
            headers: { "Content-Type": "application/json" },
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
        const response = await this.authedRequest({
            url: this.url("/list"),
            method: "GET",
            throw: false,
        });

        if (response.status !== 200) {
            throw new SyncError(
                this.messageFrom(response, "Falha ao listar arquivos."),
                response.status,
            );
        }

        const data = response.json as { files?: RemoteFile[] };
        return Array.isArray(data?.files) ? data.files : [];
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

        return this.request({
            ...options,
            headers: {
                ...(options.headers ?? {}),
                Authorization: `Bearer ${this.token}`,
            },
        });
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
