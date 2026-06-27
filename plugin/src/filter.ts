/**
 * Filtros de caminho baseados em globs, puros e testáveis.
 * Suporta `*` (qualquer coisa exceto `/`), `**` (qualquer coisa incl. `/`) e `?`.
 * Um padrão terminado em `/` casa tudo abaixo daquele diretório.
 */

/** Quebra um texto (linhas ou vírgulas) numa lista de padrões não vazios. */
export function parsePatterns(text: string): string[] {
    return text
        .split(/[\n,]/)
        .map((p) => p.trim())
        .filter((p) => p !== "");
}

function globToRegExp(glob: string): RegExp {
    let pattern = glob;
    if (pattern.endsWith("/")) {
        pattern += "**"; // "dir/" → tudo abaixo de "dir/"
    }

    let re = "";
    for (let i = 0; i < pattern.length; i++) {
        const c = pattern[i];
        if (c === "*") {
            if (pattern[i + 1] === "*") {
                re += ".*";
                i++;
                if (pattern[i + 1] === "/") i++; // "**/" casa zero ou mais diretórios
            } else {
                re += "[^/]*";
            }
        } else if (c === "?") {
            re += "[^/]";
        } else {
            re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
        }
    }

    return new RegExp("^" + re + "$");
}

export function matchGlob(path: string, pattern: string): boolean {
    return globToRegExp(pattern).test(path);
}

/**
 * Decide se um caminho deve ser sincronizado.
 * - Se houver padrões de inclusão, o caminho precisa casar com pelo menos um.
 * - Em seguida, é descartado se casar com qualquer padrão de exclusão.
 */
export function shouldSync(
    path: string,
    excludePatterns: string[],
    includePatterns: string[] = [],
): boolean {
    if (includePatterns.length > 0 && !includePatterns.some((p) => matchGlob(path, p))) {
        return false;
    }
    if (excludePatterns.some((p) => matchGlob(path, p))) {
        return false;
    }
    return true;
}
