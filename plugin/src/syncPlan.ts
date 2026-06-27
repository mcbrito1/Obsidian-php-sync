import { SyncStateEntry } from "./types";

export type { SyncStateEntry };

/** Metadados mínimos de um arquivo (local ou remoto) para o cálculo do delta. */
export interface FileMeta {
    path: string;
    hash: string;
    mtime: number;
}

export interface SyncPlan {
    /** Caminhos a enviar do local para o servidor. */
    toUpload: string[];
    /** Caminhos a baixar do servidor para o local. */
    toDownload: string[];
    /** Caminhos a apagar localmente (foram removidos no servidor). */
    toDeleteLocal: string[];
    /** Caminhos a apagar no servidor (foram removidos localmente). */
    toDeleteRemote: string[];
}

function toMap(files: FileMeta[]): Map<string, FileMeta> {
    return new Map(files.map((file) => [file.path, file]));
}

/**
 * Sincronização de 3 vias, pura e determinística.
 *
 * Compara o estado local e o remoto contra o `lastSync` (snapshot do último
 * sync bem-sucedido) para inferir o que mudou de cada lado:
 *
 *  - presente só de um lado → novo arquivo (enviar/baixar) OU, se estava no
 *    lastSync, foi apagado do outro lado (propagar a exclusão);
 *  - presente nos dois, hashes iguais → nada a fazer;
 *  - presente nos dois com hashes diferentes → enviar no sentido de quem mudou;
 *    se ambos mudaram (conflito), **o `mtime` maior vence**.
 */
export function planSync(
    local: FileMeta[],
    remote: FileMeta[],
    lastSync: Record<string, SyncStateEntry>,
): SyncPlan {
    const localMap = toMap(local);
    const remoteMap = toMap(remote);
    const paths = new Set<string>([...localMap.keys(), ...remoteMap.keys()]);

    const plan: SyncPlan = {
        toUpload: [],
        toDownload: [],
        toDeleteLocal: [],
        toDeleteRemote: [],
    };

    for (const path of paths) {
        const l = localMap.get(path);
        const r = remoteMap.get(path);
        const base = lastSync[path];

        if (l && !r) {
            // Só local: novo arquivo, ou removido no servidor desde o último sync.
            if (base && base.hash === l.hash) {
                plan.toDeleteLocal.push(path);
            } else {
                plan.toUpload.push(path);
            }
            continue;
        }

        if (!l && r) {
            // Só remoto: novo arquivo, ou removido localmente desde o último sync.
            if (base && base.hash === r.hash) {
                plan.toDeleteRemote.push(path);
            } else {
                plan.toDownload.push(path);
            }
            continue;
        }

        if (l && r) {
            if (l.hash === r.hash) {
                continue; // idênticos
            }

            const localChanged = !base || base.hash !== l.hash;
            const remoteChanged = !base || base.hash !== r.hash;

            if (localChanged && !remoteChanged) {
                plan.toUpload.push(path);
            } else if (remoteChanged && !localChanged) {
                plan.toDownload.push(path);
            } else {
                // Conflito (ou sem base): mtime maior vence; empate favorece o local.
                if (l.mtime >= r.mtime) {
                    plan.toUpload.push(path);
                } else {
                    plan.toDownload.push(path);
                }
            }
        }
    }

    plan.toUpload.sort();
    plan.toDownload.sort();
    plan.toDeleteLocal.sort();
    plan.toDeleteRemote.sort();

    return plan;
}

/**
 * Deriva o estado convergido após aplicar um plano: o hash/mtime de cada
 * arquivo que sobrevive ao sync, para servir de base no próximo delta.
 */
export function buildLastSync(
    local: FileMeta[],
    remote: FileMeta[],
    plan: SyncPlan,
): Record<string, SyncStateEntry> {
    const localMap = toMap(local);
    const remoteMap = toMap(remote);
    const removed = new Set<string>([...plan.toDeleteLocal, ...plan.toDeleteRemote]);
    const downloaded = new Set<string>(plan.toDownload);

    const state: Record<string, SyncStateEntry> = {};
    const paths = new Set<string>([...localMap.keys(), ...remoteMap.keys()]);

    for (const path of paths) {
        if (removed.has(path)) {
            continue;
        }
        // Arquivo baixado passa a refletir o conteúdo remoto; os demais, o local.
        const source = downloaded.has(path)
            ? remoteMap.get(path)
            : (localMap.get(path) ?? remoteMap.get(path));
        if (source) {
            state[path] = { hash: source.hash, mtime: source.mtime };
        }
    }

    return state;
}
