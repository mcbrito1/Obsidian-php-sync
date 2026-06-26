import { RemoteFile } from "./types";

export interface SyncPlan {
    /** Caminhos locais a serem enviados ao servidor. */
    toUpload: string[];
    /** Caminhos remotos a serem baixados para o cofre local. */
    toDownload: string[];
}

/**
 * Estrategia de sincronizacao simples e previsivel:
 *
 *  - Todo arquivo local e enviado ao servidor (o servidor passa a refletir o
 *    estado local).
 *  - Todo arquivo que existe no servidor mas NAO existe localmente e baixado
 *    (recupera notas criadas em outro dispositivo).
 *
 * Isso evita exclusoes destrutivas: nada e apagado, apenas adicionado/atualizado.
 */
export function planSync(localPaths: string[], remoteFiles: RemoteFile[]): SyncPlan {
    const localSet = new Set(localPaths);

    const toDownload = remoteFiles
        .map((file) => file.path)
        .filter((path) => !localSet.has(path));

    return {
        toUpload: [...localPaths].sort(),
        toDownload: toDownload.sort(),
    };
}
