/**
 * Calcula o sha256 (hex) de um buffer usando a Web Crypto API,
 * disponivel tanto no Electron (Obsidian) quanto no Node 20 (testes).
 */
export async function sha256(buffer: ArrayBuffer): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    const bytes = new Uint8Array(digest);

    let hex = "";
    for (const byte of bytes) {
        hex += byte.toString(16).padStart(2, "0");
    }

    return hex;
}
