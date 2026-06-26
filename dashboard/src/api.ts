import { getToken, setToken } from "./auth";
import { base64ToText, textToBase64 } from "./base64";
import { RemoteFile, VersionEntry } from "./types";

const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";

export class ApiError extends Error {
    constructor(
        message: string,
        public readonly status: number,
    ) {
        super(message);
        this.name = "ApiError";
    }
}

interface RequestOptions {
    method?: string;
    vaultId?: string;
    body?: unknown;
    auth?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { method = "GET", vaultId, body, auth = true } = options;

    const headers: Record<string, string> = {};
    if (auth) {
        headers.Authorization = `Bearer ${getToken()}`;
    }
    if (vaultId) {
        headers["X-Vault-Id"] = vaultId;
    }
    if (body !== undefined) {
        headers["Content-Type"] = "application/json";
    }

    const response = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
        const message =
            (data && (data.message || data.error)) || `Erro ${response.status}`;
        throw new ApiError(message, response.status);
    }

    return data as T;
}

export async function login(username: string, password: string): Promise<string> {
    const data = await request<{ token: string }>("/auth", {
        method: "POST",
        body: { username, password },
        auth: false,
    });
    setToken(data.token);
    return data.token;
}

export async function fetchManifest(vaultId: string): Promise<RemoteFile[]> {
    const data = await request<{ files: RemoteFile[] }>("/manifest", { vaultId });
    return data.files ?? [];
}

export async function downloadText(path: string, vaultId: string): Promise<string> {
    const data = await request<{ content: string }>(
        `/download?path=${encodeURIComponent(path)}`,
        { vaultId },
    );
    return base64ToText(data.content);
}

export async function uploadText(
    path: string,
    text: string,
    vaultId: string,
): Promise<void> {
    await request("/upload", {
        method: "POST",
        vaultId,
        body: { path, content: textToBase64(text) },
    });
}

export async function fetchVersions(
    path: string,
    vaultId: string,
): Promise<VersionEntry[]> {
    const data = await request<{ versions: VersionEntry[] }>(
        `/versions?path=${encodeURIComponent(path)}`,
        { vaultId },
    );
    return data.versions ?? [];
}

export async function fetchVersionText(
    path: string,
    id: string,
    vaultId: string,
): Promise<string> {
    const data = await request<{ content: string }>(
        `/version?path=${encodeURIComponent(path)}&id=${encodeURIComponent(id)}`,
        { vaultId },
    );
    return base64ToText(data.content);
}
