/** Conversão base64 ↔ texto UTF-8, segura para acentos e caracteres multibyte. */

export function textToBase64(text: string): string {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary);
}

export function base64ToText(base64: string): string {
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
}

/**
 * Heurística simples para detectar se um conteúdo (em base64) é texto:
 * considera binário se houver byte nulo ou se o UTF-8 não for decodificável.
 */
export function isProbablyTextBase64(base64: string): boolean {
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));

    if (bytes.includes(0)) {
        return false; // byte nulo → quase certamente binário
    }

    try {
        new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        return true;
    } catch {
        return false;
    }
}
