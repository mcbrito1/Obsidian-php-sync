/**
 * Conversao base64 <-> binario que funciona tanto no Electron (Obsidian)
 * quanto no Node (testes), sem depender de Buffer ou btoa/atob.
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const LOOKUP: number[] = (() => {
    const table = new Array<number>(256).fill(-1);
    for (let i = 0; i < ALPHABET.length; i++) {
        table[ALPHABET.charCodeAt(i)] = i;
    }
    return table;
})();

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let result = "";

    for (let i = 0; i < bytes.length; i += 3) {
        const b0 = bytes[i];
        const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
        const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;

        const triple = (b0 << 16) | (b1 << 8) | b2;

        result += ALPHABET[(triple >> 18) & 0x3f];
        result += ALPHABET[(triple >> 12) & 0x3f];
        result += i + 1 < bytes.length ? ALPHABET[(triple >> 6) & 0x3f] : "=";
        result += i + 2 < bytes.length ? ALPHABET[triple & 0x3f] : "=";
    }

    return result;
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
    // "clean" ja remove os '=' de padding, entao o tamanho em bytes deriva
    // diretamente do numero de caracteres base64 restantes.
    const clean = base64.replace(/[^A-Za-z0-9+/]/g, "");
    const byteLength = Math.floor((clean.length * 3) / 4);

    const bytes = new Uint8Array(byteLength);
    let pos = 0;

    for (let i = 0; i < clean.length; i += 4) {
        const c0 = LOOKUP[clean.charCodeAt(i)];
        const c1 = LOOKUP[clean.charCodeAt(i + 1)];
        const c2 = LOOKUP[clean.charCodeAt(i + 2)];
        const c3 = LOOKUP[clean.charCodeAt(i + 3)];

        const triple =
            (c0 << 18) |
            (c1 << 12) |
            ((c2 < 0 ? 0 : c2) << 6) |
            (c3 < 0 ? 0 : c3);

        if (pos < byteLength) bytes[pos++] = (triple >> 16) & 0xff;
        if (pos < byteLength) bytes[pos++] = (triple >> 8) & 0xff;
        if (pos < byteLength) bytes[pos++] = triple & 0xff;
    }

    return bytes.buffer;
}

/** Codifica texto UTF-8 em base64. */
export function textToBase64(text: string): string {
    const encoder = new TextEncoder();
    return arrayBufferToBase64(encoder.encode(text).buffer);
}

/** Decodifica base64 em texto UTF-8. */
export function base64ToText(base64: string): string {
    const decoder = new TextDecoder();
    return decoder.decode(base64ToArrayBuffer(base64));
}
