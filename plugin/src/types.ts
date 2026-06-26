/** Configuracoes persistidas do plugin. */
export interface PluginSettings {
    serverUrl: string;
    username: string;
    password: string;
    /** Token Bearer obtido apos autenticar (salvo nas configuracoes). */
    token: string;
}

export const DEFAULT_SETTINGS: PluginSettings = {
    serverUrl: "http://localhost:8080",
    username: "",
    password: "",
    token: "",
};

/** Resposta esperada do endpoint POST /auth. */
export interface AuthResponse {
    token: string;
    token_type: string;
    expires_in: number;
}

/** Metadados de um arquivo retornados por GET /list. */
export interface RemoteFile {
    path: string;
    size: number;
    mtime: number;
}

/**
 * Subconjunto do `requestUrl`/`RequestUrlResponse` do Obsidian que usamos.
 * Tipar isto permite injetar um cliente falso nos testes.
 */
export interface HttpResponse {
    status: number;
    json: unknown;
    text: string;
    arrayBuffer: ArrayBuffer;
}

export interface HttpRequestOptions {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    /** Nao lancar excecao para status >= 400; tratamos manualmente. */
    throw?: boolean;
}

export type HttpRequestFn = (options: HttpRequestOptions) => Promise<HttpResponse>;
