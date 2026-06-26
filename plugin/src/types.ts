/** Snapshot de um arquivo no momento do ultimo sync bem-sucedido. */
export interface SyncStateEntry {
    hash: string;
    mtime: number;
}

/** Configuracoes persistidas do plugin. */
export interface PluginSettings {
    serverUrl: string;
    username: string;
    password: string;
    /** Token Bearer obtido apos autenticar (salvo nas configuracoes). */
    token: string;
    /** Identificador do cofre no servidor (header X-Vault-Id). Vazio = "default". */
    vaultId: string;
    /** Sincronizar automaticamente ao abrir o Obsidian. */
    syncOnStartup: boolean;
    /** Sincronizar (com debounce) quando arquivos mudam. */
    syncOnChange: boolean;
    /** Intervalo de auto-sync em minutos (0 = desativado). */
    syncIntervalMinutes: number;
    /** Padroes (glob) a excluir do sync; um por linha ou separados por virgula. */
    excludePatterns: string;
    /** Padroes (glob) a incluir; vazio = tudo (menos exclusoes). */
    includePatterns: string;
    /** Estado do ultimo sync, por caminho — base para detectar deltas e delecoes. */
    lastSync: Record<string, SyncStateEntry>;
}

export const DEFAULT_SETTINGS: PluginSettings = {
    serverUrl: "http://localhost:8080",
    username: "",
    password: "",
    token: "",
    vaultId: "",
    syncOnStartup: false,
    syncOnChange: false,
    syncIntervalMinutes: 0,
    excludePatterns: ".obsidian/\n.trash/",
    includePatterns: "",
    lastSync: {},
};

/** Resposta esperada do endpoint POST /auth. */
export interface AuthResponse {
    token: string;
    token_type: string;
    expires_in: number;
}

/** Metadados de um arquivo retornados por GET /manifest. */
export interface RemoteFile {
    path: string;
    hash: string;
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
