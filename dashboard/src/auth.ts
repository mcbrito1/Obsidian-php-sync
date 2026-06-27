/** Armazenamento simples do token JWT no navegador (localStorage). */

const TOKEN_KEY = "ophp_token";
const ADMIN_KEY = "ophp_admin";

export function getToken(): string {
    return localStorage.getItem(TOKEN_KEY) ?? "";
}

export function setToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ADMIN_KEY);
}

export function isLoggedIn(): boolean {
    return getToken() !== "";
}

/** Marca se o usuário tem escopo de administrador (acesso a todos os cofres). */
export function setAdmin(isAdmin: boolean): void {
    localStorage.setItem(ADMIN_KEY, isAdmin ? "1" : "0");
}

export function isAdminUser(): boolean {
    return localStorage.getItem(ADMIN_KEY) === "1";
}
